import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RoundHole, ShotRecord } from '@/lib/types/golf';
import { RoundTracking, type RoundTrackingProps } from '../screens/rounds/track/RoundTracking';
import { ExitSheet, RoundCompleteSheet, ScorecardSheet, SubmitOverlay } from '../screens/rounds/track/round-sheets';
import { heroDistance, quickPicks, roundSoFar, scoreName, shotLine, shotTitle } from '../screens/rounds/track/labels';
import { ToastProvider } from '../ui/Toast';
import './dialog-polyfill';

// jsdom has no layout: the state machine scrolls the distance box into view.
Element.prototype.scrollIntoView ??= function () {};

const deleteShot = vi.fn();
const updateShot = vi.fn();
vi.mock('@/app/golf/actions/golf', () => ({
  deleteShot: (...a: unknown[]) => deleteShot(...a),
  updateShot: (...a: unknown[]) => updateShot(...a),
}));

const HOLES: RoundHole[] = [
  { number: 1, par: 4, yardage: 420, score: null },
  { number: 2, par: 5, yardage: 540, score: null },
  { number: 3, par: 3, yardage: 170, score: null },
];
const ROUND = { course: 'Finley GC', teeLabel: 'Blue', teeColor: 'blue' as const, type: 'practice' as const };

const shot = (s: Partial<ShotRecord> & Pick<ShotRecord, 'shotNumber' | 'shotType' | 'result'>): ShotRecord => ({
  clubType: 'non_driver',
  lieBefore: 'fairway',
  distanceToHoleBefore: 0,
  distanceUnitBefore: 'yards',
  distanceToHoleAfter: 0,
  distanceUnitAfter: 'yards',
  shotDistance: 0,
  isPenalty: false,
  ...s,
});
const TEE = shot({ shotNumber: 1, shotType: 'tee', clubType: 'driver', lieBefore: 'tee', distanceToHoleBefore: 420, result: 'fairway', distanceToHoleAfter: 150, shotDistance: 270 });

function setup(over: Partial<RoundTrackingProps> = {}) {
  const props: RoundTrackingProps = {
    round: ROUND,
    holes: HOLES,
    currentHoleIndex: 0,
    onHoleComplete: vi.fn(async () => true),
    onNavigateToHole: vi.fn(),
    ...over,
  };
  render(
    <ToastProvider>
      <RoundTracking {...props} />
    </ToastProvider>,
  );
  return { props, user: userEvent.setup() };
}
const code = (c: string) => document.querySelector(`[data-ch-code="${c}"]`);
const next = () => screen.getByRole('button', { name: /Record next shot|Complete hole/ });
const pick = (name: string | RegExp) => screen.getByRole('radio', { name });

afterEach(() => {
  localStorage.removeItem('golf_distance_unit_pref');
  deleteShot.mockReset();
  updateShot.mockReset();
});

describe('Round tracking: words', () => {
  it('names shots, lines, scores and the round so far', () => {
    expect(shotTitle(TEE)).toBe('Tee · Driver');
    expect(shotLine(TEE, 'yards')).toBe('420 yds → fairway · 150 yds');
    expect(shotLine(TEE, 'meters')).toBe('384 m → fairway · 137 m');
    const putt = shot({
      shotNumber: 3,
      shotType: 'putting',
      lieBefore: 'green',
      distanceToHoleBefore: 12,
      distanceUnitBefore: 'feet',
      result: 'hole',
      puttBreak: 'left_to_right',
      puttSlope: 'uphill',
    });
    expect(shotTitle(putt)).toBe('Putt');
    expect(shotLine(putt, 'yards')).toBe('12 ft → holed · L → R, uphill');
    expect(shotLine(shot({ shotNumber: 2, shotType: 'penalty', result: 'penalty', isPenalty: true, penaltyType: 'water' }), 'yards')).toBe('+1 stroke');
    expect([scoreName(3, 4), scoreName(4, 4), scoreName(6, 4), scoreName(9, 4), scoreName(1, 3)]).toEqual(['Birdie', 'Par', 'Double bogey', '+5', 'Hole in one']);
    expect(roundSoFar([{ ...HOLES[0]!, score: 3 }, { ...HOLES[1]!, score: 6 }, HOLES[2]!])).toEqual({ thru: 2, strokes: 9, toPar: 0 });
    expect(roundSoFar(HOLES).toPar).toBeNull();
    expect(heroDistance(12, 'feet', 'yards')).toEqual({ figure: 12, words: 'feet to the hole' });
    expect(heroDistance(150, 'yards', 'meters')).toEqual({ figure: 137, words: 'meters to the pin' });
    expect([quickPicks('feet', 'yards'), quickPicks('feet', 'meters'), quickPicks('tee', 'yards')]).toEqual([
      [5, 10, 15, 20, 30, 40],
      [1, 2, 3, 5, 9, 12],
      [120, 140, 160, 180],
    ]);
  });
});

describe('Round tracking: recording a shot', () => {
  it('CH-11101 names the one thing still missing, then records the shot (CH-11705)', async () => {
    const { user } = setup();
    expect(screen.getByText('420')).toBeInTheDocument();
    expect(code('CH-11101')).toHaveTextContent('Select a shot result');
    expect(next()).toBeDisabled();
    expect(next()).toHaveAttribute('aria-describedby', 'ch-rt-blocker');
    await user.click(pick('Fairway'));
    expect(code('CH-11101')).toHaveTextContent('Choose driver or non-driver');
    await user.click(pick('Driver'));
    expect(code('CH-11101')).toHaveTextContent('Enter the distance remaining');
    await user.type(screen.getByLabelText('Distance remaining (yds)'), '150');
    expect(code('CH-11101')).toBeNull();
    expect(screen.getByText(/Shot distance/)).toHaveTextContent('~270 yds');
    await user.click(next());
    await waitFor(() => expect(screen.getByText(/^Shot 2/)).toBeInTheDocument());
    expect(screen.getByText('1 stroke')).toBeInTheDocument();
    expect(screen.getByText('150')).toBeInTheDocument();
  });

  it('CH-11102 a warning asks once; changing the shot asks again', async () => {
    const { user } = setup();
    await user.click(pick(/^Green/));
    await user.click(pick('Driver'));
    await user.type(screen.getByLabelText('Proximity to hole (ft)'), '20');
    expect(code('CH-11102')).toHaveTextContent('A 420-yard drive onto the green? Tap to confirm.');
    expect(next()).toBeDisabled();
    expect(code('CH-11101')).toHaveTextContent('Confirm the result above to continue');
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(next()).toBeEnabled();
    expect(code('CH-11102')).toHaveTextContent('Confirmed');
    await user.clear(screen.getByLabelText('Proximity to hole (ft)'));
    await user.type(screen.getByLabelText('Proximity to hole (ft)'), '25');
    expect(next()).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
  });

  it('CH-11103 an impossible shot is blocked with no confirm', async () => {
    const { user } = setup({ currentHoleIndex: 1 });
    await user.click(pick(/^Green/));
    await user.click(pick('Driver'));
    await user.type(screen.getByLabelText('Proximity to hole (ft)'), '20');
    expect(code('CH-11103')).toHaveTextContent(/540-yard drive onto the green isn't possible/);
    expect(screen.queryByRole('button', { name: 'Confirm' })).toBeNull();
    expect(next()).toBeDisabled();
  });

  it('CH-11104 a distance that is not a number says so', async () => {
    const { user } = setup();
    await user.click(pick('Fairway'));
    await user.type(screen.getByLabelText('Distance remaining (yds)'), 'abc');
    expect(code('CH-11104')).toHaveTextContent('Enter the distance as a number');
    expect(screen.getByLabelText('Distance remaining (yds)')).toHaveAttribute('aria-invalid', 'true');
  });

  it('a quick pick fills the distance in the locked unit', async () => {
    const { user } = setup({ initialShots: [TEE], initialShotNumber: 2 });
    await user.click(pick(/^Green/));
    await user.click(screen.getByRole('button', { name: '15' }));
    expect(screen.getByLabelText('Proximity to hole (ft)')).toHaveValue('15');
    expect(screen.getByRole('button', { name: '15' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('the approach miss grid is required off the green; putt tags pair up', async () => {
    const { user } = setup({ initialShots: [TEE], initialShotNumber: 2 });
    await user.click(pick('Rough'));
    await user.type(screen.getByLabelText('Distance remaining (yds)'), '20');
    expect(code('CH-11101')).toHaveTextContent('Choose a miss direction');
    await user.click(pick('Short left'));
    expect(code('CH-11101')).toBeNull();
  });

  it('meters: the hero, the label and the quick picks follow the preference', async () => {
    localStorage.setItem('golf_distance_unit_pref', 'meters');
    const { user } = setup();
    await waitFor(() => expect(screen.getByText('meters to the pin')).toBeInTheDocument());
    expect(screen.getByText('384')).toBeInTheDocument();
    await user.click(pick('Fairway'));
    expect(screen.getByLabelText('Distance remaining (m)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '145' })).toBeInTheDocument();
  });

  it('CH-11106 warns from shot 12 of the 15 a hole can record', () => {
    const shots = Array.from({ length: 11 }, (_, i) =>
      shot({
        shotNumber: i + 1,
        shotType: i ? 'approach' : 'tee',
        lieBefore: i ? 'rough' : 'tee',
        distanceToHoleBefore: 420 - i * 30,
        result: 'rough',
        distanceToHoleAfter: 390 - i * 30,
        missDirection: 'left',
      }),
    );
    setup({ initialShots: shots, initialShotNumber: 12 });
    expect(code('CH-11106')).toHaveTextContent('Shot 12 of 15. 3 more before the limit.');
  });
});

describe('Round tracking: undo, penalty, moving between holes', () => {
  it('CH-11502 undo asks first, then removes the shot (CH-11308 the empty log)', async () => {
    const { user } = setup({ initialShots: [TEE], initialShotNumber: 2 });
    await user.click(screen.getByRole('button', { name: 'Undo last shot' }));
    expect(code('CH-11502')).toHaveTextContent('Undo shot 1?');
    await user.click(within(code('CH-11502') as HTMLElement).getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(code('CH-11308')).toHaveTextContent('No shots yet on this hole'));
  });

  it('CH-11002 a failed undo says so and keeps the shot', async () => {
    deleteShot.mockResolvedValue({ success: false, error: 'nope', code: 'db_error' });
    const { user } = setup({ initialShots: [{ ...TEE, id: 'shot-1' }], initialShotNumber: 2 });
    await user.click(screen.getByRole('button', { name: 'Undo last shot' }));
    await user.click(within(code('CH-11502') as HTMLElement).getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(code('CH-11002')).toHaveTextContent('Couldn’t undo the shot'));
    expect(deleteShot).toHaveBeenCalledWith('shot-1');
    expect(screen.getByText('1 stroke')).toBeInTheDocument();
  });

  it('CH-11503 a penalty can be added before any shot; Add waits for a choice', async () => {
    const { user } = setup();
    const add = screen.getByRole('button', { name: 'Add penalty stroke' });
    expect(add).toBeEnabled();
    await user.click(add);
    const sheet = code('CH-11503') as HTMLElement;
    expect(within(sheet).getByRole('button', { name: 'Add 1 stroke' })).toBeDisabled();
    await user.click(within(sheet).getByRole('radio', { name: /Out of bounds/ }));
    expect(within(sheet).getByRole('radiogroup', { name: 'Which stroke went out' })).toBeInTheDocument();
    await user.click(within(sheet).getByRole('radio', { name: /Water hazard/ }));
    expect(within(sheet).queryByRole('radiogroup', { name: 'Which stroke went out' })).toBeNull();
    await user.click(within(sheet).getByRole('button', { name: 'Add 1 stroke' }));
    await waitFor(() => expect(screen.getByText(/penalt/)).toBeInTheDocument());
  });

  it('CH-11805 the strip: finished and earlier holes are buttons, later unplayed ones are marks', async () => {
    const holes = [{ ...HOLES[0]!, score: 4 }, HOLES[1]!, HOLES[2]!];
    const { user, props } = setup({ holes, currentHoleIndex: 1 });
    expect(screen.getByRole('button', { name: 'Go to hole 1, 4 strokes' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Hole 2, current hole' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Hole 3' })).toBeInTheDocument();
    expect(screen.getByText('Thru 1')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Go to hole 1, 4 strokes' }));
    expect(props.onNavigateToHole).toHaveBeenCalledWith(0);
  });

  it('CH-11504 leaving a hole with a result picked but not recorded asks first', async () => {
    const holes = [{ ...HOLES[0]!, score: 4 }, HOLES[1]!, HOLES[2]!];
    const { user, props } = setup({ holes, currentHoleIndex: 1 });
    await user.click(pick('Fairway'));
    await user.click(screen.getByRole('button', { name: 'Go to hole 1, 4 strokes' }));
    expect(props.onNavigateToHole).not.toHaveBeenCalled();
    const sheet = code('CH-11504') as HTMLElement;
    await user.click(within(sheet).getByRole('button', { name: 'Stay' }));
    expect(props.onNavigateToHole).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Go to hole 1, 4 strokes' }));
    await user.click(within(code('CH-11504') as HTMLElement).getByRole('button', { name: 'Leave without it' }));
    expect(props.onNavigateToHole).toHaveBeenCalledWith(0);
  });
});

describe('Round tracking: holing out', () => {
  it('CH-11402 saving the hole, then CH-11003 when it fails, with Try again', async () => {
    let finish: (ok: boolean) => void = () => {};
    const onHoleComplete = vi.fn(() => new Promise<boolean>((r) => (finish = r)));
    const { user } = setup({ currentHoleIndex: 2, onHoleComplete });
    await user.click(pick(/^Holed/));
    expect(next()).toHaveAccessibleName('Complete hole with score 1');
    await user.click(next());
    await waitFor(() => expect(code('CH-11402')).toHaveTextContent('Saving hole 3'));
    expect(onHoleComplete).toHaveBeenCalledWith(2, expect.objectContaining({ holeNumber: 3, score: 1 }));
    expect(screen.getByText('Hole in one')).toBeInTheDocument();
    await act(async () => finish(false));
    expect(code('CH-11003')).toHaveTextContent('Hole 3 didn’t save');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onHoleComplete).toHaveBeenCalledTimes(2);
    await act(async () => finish(true));
    expect(code('CH-11003')).toBeNull();
  });

  it('a finished hole looked back at offers the way back, and a shot opens to change or delete (CH-11505)', async () => {
    const holed = [
      shot({ shotNumber: 1, shotType: 'tee', lieBefore: 'tee', distanceToHoleBefore: 170, result: 'green', distanceToHoleAfter: 20, distanceUnitAfter: 'feet' }),
      shot({ shotNumber: 2, shotType: 'putting', lieBefore: 'green', distanceToHoleBefore: 20, distanceUnitBefore: 'feet', result: 'hole', distanceUnitAfter: 'feet' }),
    ];
    const holes = [HOLES[0]!, HOLES[1]!, { ...HOLES[2]!, score: 2 }];
    const { user, props } = setup({ holes, currentHoleIndex: 2, initialShots: holed, initialShotNumber: 3 });
    expect(screen.getByText('Birdie')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back to hole 1' }));
    expect(props.onNavigateToHole).toHaveBeenCalledWith(0);
    await user.click(screen.getByRole('button', { name: /^Change shot 1/ }));
    const sheet = code('CH-11505') as HTMLElement;
    expect(within(sheet).getByRole('heading', { name: 'Change shot 1' })).toBeInTheDocument();
    await user.click(within(sheet).getByRole('button', { name: 'Delete' }));
    expect(within(sheet).getByText(/Delete shot 1\?/)).toBeInTheDocument();
    await user.click(within(sheet).getByRole('button', { name: 'Keep it' }));
    expect(within(sheet).getByRole('button', { name: 'Save shot' })).toBeInTheDocument();
  });
});

describe('Round tracking: the round sheets', () => {
  const card = [
    { number: 1, par: 4, score: 5, putts: 2 },
    { number: 2, par: 5, score: 4, putts: 1 },
    { number: 3, par: 3, score: null, putts: null },
  ];

  it('CH-11506 Exit: save for later, keep playing, and a discard that asks first (CH-11507)', async () => {
    const user = userEvent.setup();
    const onDiscard = vi.fn();
    const onSave = vi.fn();
    render(<ExitSheet open course="Finley GC" holes={card} currentNumber={3} discarding={false} discardError={null} onSave={onSave} onKeep={vi.fn()} onDiscard={onDiscard} />);
    const sheet = code('CH-11506') as HTMLElement;
    expect(within(sheet).getByText('Finley GC · thru 2 · E')).toBeInTheDocument();
    await user.click(within(sheet).getByRole('button', { name: /Save for later/ }));
    expect(onSave).toHaveBeenCalled();
    await user.click(within(sheet).getByRole('button', { name: /Discard round/ }));
    expect(onDiscard).not.toHaveBeenCalled();
    expect(code('CH-11507')).toHaveTextContent('Discard this round?');
    await user.click(within(code('CH-11507') as HTMLElement).getByRole('button', { name: 'Discard round' }));
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });

  it('CH-11509 the scorecard totals what is scored so far and marks the current hole', () => {
    render(<ScorecardSheet open onClose={vi.fn()} course="Finley GC" tee="Blue" holes={card} current={3} />);
    const out = screen.getByRole('table', { name: /Front nine/ });
    const [, par, score, putts] = within(out).getAllByRole('row');
    expect(within(par!).getAllByRole('cell').at(-1)).toHaveTextContent('12');
    expect(within(score!).getAllByRole('cell').at(-1)).toHaveTextContent('9');
    expect(within(putts!).getAllByRole('cell').at(-1)).toHaveTextContent('3');
    expect(within(out).getByRole('columnheader', { name: '3' })).toHaveAttribute('aria-current', 'step');
  });

  it('CH-11509 a nine with nothing scored totals only its par', () => {
    render(<ScorecardSheet open onClose={vi.fn()} course="Finley GC" tee={null} holes={card.map((h) => ({ ...h, score: null, putts: null }))} current={1} />);
    const [, par, score, putts] = within(screen.getByRole('table', { name: /Front nine/ })).getAllByRole('row');
    expect(within(par!).getAllByRole('cell').at(-1)).toHaveTextContent('12');
    expect(within(score!).getAllByRole('cell').at(-1)).toHaveTextContent('—');
    expect(within(putts!).getAllByRole('cell').at(-1)).toHaveTextContent('—');
  });

  it('CH-11508 the finished round: figures, and Submit', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const holes = [
      { number: 1, par: 4, score: 4, putts: 2, fairwayHit: true, gir: true },
      { number: 2, par: 5, score: 6, putts: 2, fairwayHit: false, gir: false },
      { number: 3, par: 3, score: 2, putts: 1, fairwayHit: null, gir: true },
    ];
    render(<RoundCompleteSheet open heading="Finley GC · Blue · Oct 14" holes={holes} onBack={vi.fn()} onSubmit={onSubmit} />);
    const sheet = code('CH-11508') as HTMLElement;
    const hero = sheet.querySelector('.ch-rt-sum__hero') as HTMLElement;
    expect(within(hero).getByText('12')).toBeInTheDocument();
    expect(within(hero).getByText('E')).toBeInTheDocument();
    expect(within(sheet).getByText('Fairways').nextSibling).toHaveTextContent('1/2');
    expect(within(sheet).getByText('Greens').nextSibling).toHaveTextContent('2/3');
    expect(within(sheet).queryByText('Front · Back')).toBeNull();
    await user.click(within(sheet).getByRole('button', { name: 'Submit round' }));
    expect(onSubmit).toHaveBeenCalled();
  });

  it('CH-11603 submitting names the real shot count; CH-11005 a failed submit offers Try again', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const { rerender } = render(<SubmitOverlay state="saving" course="Finley GC" shots={71} coach="Coach Reyes" reviewHref="/r" error={null} onRetry={onRetry} />);
    expect(screen.getByRole('status')).toHaveTextContent('Saving 71 shots');
    rerender(<SubmitOverlay state="done" course="Finley GC" shots={71} coach="Coach Reyes" reviewHref="/r" error={null} onRetry={onRetry} />);
    expect(screen.getByRole('status')).toHaveTextContent('Coach Reyes can see it now.');
    expect(screen.getByRole('link', { name: 'View round review' })).toHaveAttribute('href', '/r');
    rerender(<SubmitOverlay state="failed" course="Finley GC" shots={71} coach={null} reviewHref={null} error={null} onRetry={onRetry} />);
    expect(code('CH-11005')).toHaveTextContent('The round didn’t submit');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalled();
  });
});

/**
 * P011 shot entry, against the Fairway entry (2026-10-17 parity pass). The
 * full differential, both screens played through their own controls, is
 * src/hooks/golf/__tests__/shot-entry-parity.test.tsx (it renders Fairway, so
 * it can't live here). These are the Clubhouse sides of its two fixes: a
 * recorded shot opens to change or delete before the hole is holed (Fairway's
 * shot pills), and the distance boxes only ever hand the engine a number.
 */
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RoundHole, ShotRecord } from '@/lib/types/golf';
import { RoundTracking, type RoundTrackingProps } from '../screens/rounds/track/RoundTracking';
import { cleanDistance, isDistanceText } from '../screens/rounds/track/labels';
import { ShotLog } from '../screens/rounds/track/parts';
import { ToastProvider } from '../ui/Toast';
import './dialog-polyfill';

Element.prototype.scrollIntoView ??= function () {};

vi.mock('@/app/golf/actions/shot-actions', () => ({
  deleteShot: vi.fn(async () => ({ success: true })),
  updateShot: vi.fn(async () => ({ success: true })),
}));

const HOLES: RoundHole[] = [{ number: 1, par: 4, yardage: 400, score: null }];
const ROUND = { course: 'Finley GC', teeLabel: 'Blue', teeColor: 'blue' as const, type: 'practice' as const };
const TEE: ShotRecord = {
  shotNumber: 1,
  shotType: 'tee',
  clubType: 'driver',
  lieBefore: 'tee',
  distanceToHoleBefore: 400,
  distanceUnitBefore: 'yards',
  result: 'fairway',
  distanceToHoleAfter: 150,
  distanceUnitAfter: 'yards',
  shotDistance: 250,
  isPenalty: false,
};

function setup(over: Partial<RoundTrackingProps> = {}) {
  const props: RoundTrackingProps = {
    round: ROUND,
    holes: HOLES,
    currentHoleIndex: 0,
    initialShots: [TEE],
    initialShotNumber: 2,
    onHoleComplete: vi.fn(async () => true),
    onAutoSave: vi.fn(async () => {}),
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

afterEach(() => {
  cleanup();
  localStorage.removeItem('golf_distance_unit_pref');
});

describe('P011 distance boxes hand the engine a number', () => {
  it('reads a comma as the decimal point and knows a plain number', () => {
    expect(cleanDistance('1,5')).toBe('1.5');
    expect(cleanDistance('150')).toBe('150');
    expect(['150', '1.5', '3.', '.5', ' 12 '].map(isDistanceText)).toEqual([true, true, true, true, true]);
    expect(['150y', '1.5.2', '-3', 'abc', '', '.'].map(isDistanceText)).toEqual([false, false, false, false, false, false]);
  });

  it('CH-11104 a box that is not a plain number blocks Next shot (it was read as its leading digits)', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('radio', { name: /^Green/ }));
    await user.type(screen.getByLabelText('Proximity to hole (ft)'), '12ft');
    expect(document.querySelector('[data-ch-code="CH-11104"]')).toBeInTheDocument();
    expect(document.querySelector('[data-ch-code="CH-11101"]')).toHaveTextContent('Enter a valid distance');
    expect(screen.getByRole('button', { name: 'Record next shot' })).toBeDisabled();
  });

  it('CH-11105 the change sheet refuses a distance that is not a number', async () => {
    const onAutoSave = vi.fn(async () => {});
    const { user } = setup({ onAutoSave });
    await user.click(screen.getByRole('button', { name: /1 stroke/ }));
    await user.click(screen.getByRole('button', { name: /^Change shot 1:/ }));
    const sheet = document.querySelector('[data-ch-code="CH-11505"]') as HTMLElement;
    const after = within(sheet).getByLabelText('Distance after');
    await user.clear(after);
    await user.type(after, '15o');
    await user.click(within(sheet).getByRole('button', { name: 'Save shot' }));
    expect(within(sheet).getByText('Enter each distance as a number, like 150.')).toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: 'Save shot' })).toBeDisabled();
    expect(onAutoSave).not.toHaveBeenCalled();
  });
});

describe('P011 CH-11505 a recorded shot opens before the hole is holed', () => {
  it('the open shot log lists each shot as a button that opens the change sheet, and the change is saved', async () => {
    const onAutoSave = vi.fn(async () => {});
    const { user } = setup({ onAutoSave });
    await user.click(screen.getByRole('button', { name: /1 stroke/ }));
    await user.click(screen.getByRole('button', { name: 'Change shot 1: Tee · Driver, 400\u00a0yds → fairway · 150\u00a0yds left' }));
    const sheet = document.querySelector('[data-ch-code="CH-11505"]') as HTMLElement;
    expect(within(sheet).getByRole('heading', { name: 'Change shot 1' })).toBeInTheDocument();
    const after = within(sheet).getByLabelText('Distance after');
    await user.clear(after);
    await user.type(after, '145');
    await user.click(within(sheet).getByRole('button', { name: 'Save shot' }));
    await waitFor(() => expect(onAutoSave).toHaveBeenCalled());
    const [shots] = onAutoSave.mock.calls.at(-1)! as unknown as [ShotRecord[]];
    expect(shots[0]).toMatchObject({ shotNumber: 1, distanceToHoleAfter: 145, distanceUnitAfter: 'yards' });
    // The next shot now starts where the changed one finished.
    await waitFor(() => expect(screen.getByText('145')).toBeInTheDocument());
  });

  it('without onEdit the rows stay read-only, and editDisabled holds them while a save runs', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<ShotLog shots={[TEE]} pref="yards" />);
    await user.click(screen.getByRole('button', { name: /1 stroke/ }));
    expect(screen.queryByRole('button', { name: /^Change shot 1/ })).toBeNull();
    unmount();
    const onEdit = vi.fn();
    render(<ShotLog shots={[TEE]} pref="yards" onEdit={onEdit} editDisabled />);
    await user.click(screen.getByRole('button', { name: /1 stroke/ }));
    expect(screen.getByRole('button', { name: /^Change shot 1/ })).toBeDisabled();
  });
});

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { RoundHole, ShotRecord } from '@/lib/types/golf';
import { AutoSaveHeldError } from '@/hooks/golf/use-shot-state-machine';
import userEvent from '@testing-library/user-event';
import { ExitSheet, SubmitOverlay } from '../screens/rounds/track/round-sheets';
import { RoundTracking, type RoundTrackingProps } from '../screens/rounds/track/RoundTracking';
import { ToastProvider } from '../ui/Toast';
import './dialog-polyfill';

/*
 * CH-11901, swap audit R-1: "Round saved" is said only for a save the server acknowledged. A save held on the device
 * (offline, queued, busy, refused until a reload) says "Saved on this phone".
 */

Element.prototype.scrollIntoView ??= function () {};

vi.mock('@/app/golf/actions/golf', () => ({ deleteShot: vi.fn(), updateShot: vi.fn() }));

const HOLES: RoundHole[] = [
  { number: 1, par: 4, yardage: 420, score: null },
  { number: 2, par: 5, yardage: 540, score: null },
];
const TEE: ShotRecord = {
  shotNumber: 1,
  shotType: 'tee',
  clubType: 'driver',
  lieBefore: 'tee',
  distanceToHoleBefore: 420,
  distanceUnitBefore: 'yards',
  result: 'fairway',
  distanceToHoleAfter: 150,
  distanceUnitAfter: 'yards',
  shotDistance: 270,
  isPenalty: false,
};

function setup(onAutoSave: RoundTrackingProps['onAutoSave']) {
  render(
    <ToastProvider>
      <RoundTracking
        round={{ course: 'Finley GC', teeLabel: 'Blue', teeColor: 'blue', type: 'practice' }}
        holes={HOLES}
        currentHoleIndex={0}
        initialShots={[TEE]}
        initialShotNumber={2}
        onHoleComplete={vi.fn(async () => true)}
        onAutoSave={onAutoSave}
        autoSaveInterval={10}
      />
    </ToastProvider>,
  );
}

describe('R-12 the Exit sheet while a write runs', () => {
  const sheet = (over: { discarding?: boolean; saving?: boolean }, onKeep = vi.fn()) => {
    render(
      <ExitSheet
        open
        course="Finley GC"
        holes={[{ number: 1, par: 4, score: 4, putts: 2 }]}
        currentNumber={2}
        discarding={over.discarding ?? false}
        saving={over.saving}
        discardError={null}
        onSave={vi.fn()}
        onKeep={onKeep}
        onDiscard={vi.fn()}
      />,
    );
    return onKeep;
  };
  // Escape, the backdrop and the close button all reach the Modal's `onClose`; the close button is the one jsdom drives.
  const dismiss = () => userEvent.setup().click(screen.getByRole('button', { name: 'Close' }));

  it('Save for later shows that it is saving, and the sheet cannot be dismissed under it', async () => {
    const onKeep = sheet({ saving: true });
    expect(screen.getByRole('button', { name: /Saving…/ })).toBeDisabled();
    await dismiss();
    expect(onKeep).not.toHaveBeenCalled();
  });

  it('a discard in flight cannot be dismissed either', async () => {
    const onKeep = sheet({ discarding: true });
    await dismiss();
    expect(onKeep).not.toHaveBeenCalled();
  });

  it('with nothing running, closing keeps playing', async () => {
    const onKeep = sheet({});
    await dismiss();
    expect(onKeep).toHaveBeenCalled();
  });
});

describe('R-11 the posted round claims only what is true', () => {
  it('names no coach when the round screen has none to name', () => {
    render(<SubmitOverlay state="done" course="Finley GC" shots={71} coach={null} reviewHref="/r" error={null} onRetry={vi.fn()} />);
    expect(screen.getByRole('status')).toHaveTextContent('Your round at Finley GC is posted.');
    expect(screen.getByRole('status')).not.toHaveTextContent(/coach/i);
  });
});

describe('CH-11901 the round save line', () => {
  it('says "Saved on this phone", never "Round saved", when the save was held on the device', async () => {
    setup(vi.fn(async () => {
      throw new AutoSaveHeldError('offline', true);
    }));

    expect(await screen.findByText('Saved on this phone')).toBeInTheDocument();
    expect(screen.queryByText('Round saved')).toBeNull();
  });

  it('says "Round saved" when the server acknowledged it', async () => {
    setup(vi.fn(async () => {}));

    expect(await screen.findByText('Round saved')).toBeInTheDocument();
    expect(screen.queryByText('Saved on this phone')).toBeNull();
  });
});

describe('CH-11901 before the server answers (owner rule 3, 2026-10-01)', () => {
  /** A fresh hole: record the tee shot through the screen. `onDevice` is what the engine's device copy answered. */
  async function recordTeeShot(onDevice: boolean | void, onAutoSave: RoundTrackingProps['onAutoSave']) {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <RoundTracking
          round={{ course: 'Finley GC', teeLabel: 'Blue', teeColor: 'blue', type: 'practice' }}
          holes={HOLES}
          currentHoleIndex={0}
          onHoleComplete={vi.fn(async () => true)}
          onSaveShot={() => onDevice}
          onAutoSave={onAutoSave}
          autoSaveInterval={60_000}
        />
      </ToastProvider>,
    );
    await user.click(screen.getByRole('radio', { name: 'Fairway' }));
    await user.click(screen.getByRole('radio', { name: 'Driver' }));
    await user.type(screen.getByLabelText('Distance remaining (yds)'), '150');
    await user.click(screen.getByRole('button', { name: /Record next shot/ }));
  }

  it('says "Saved on this phone · syncing" for a shot whose device copy landed, and never "Round saved"', async () => {
    await recordTeeShot(true, vi.fn(async () => {}));

    expect(await screen.findByText('Saved on this phone · syncing')).toBeInTheDocument();
    expect(screen.queryByText('Round saved')).toBeNull();
  });

  it('says nothing about where the shot is when its device copy did not land', async () => {
    await recordTeeShot(false, vi.fn(async () => {}));

    expect(await screen.findByText(/^Shot 2/)).toBeInTheDocument();
    expect(document.querySelector('[data-ch-code="CH-11901"]')).toBeNull();
  });

  it('says nothing when the engine reports no device copy at all (a renderer without one)', async () => {
    await recordTeeShot(undefined, vi.fn(async () => {}));

    expect(await screen.findByText(/^Shot 2/)).toBeInTheDocument();
    expect(document.querySelector('[data-ch-code="CH-11901"]')).toBeNull();
  });
});


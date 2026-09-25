// @vitest-environment jsdom
/**
 * ============================================================================
 * HubPlanBoard — "Your plan" edits in place on the CoachHelm overview (HUB-19)
 * ----------------------------------------------------------------------------
 * Pins: the writes are the existing focus-area actions with their existing
 * arguments; a save moves the bar before the server answers and moves it back
 * when the server refuses; a completed row leaves at once and comes back on a
 * failure; every failure raises a danger toast; nothing here is a primary
 * button (the overview's one primary is "Log a round"); non-actionable rows
 * don't open.
 * ========================================================================== */
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { StageRouter } from '@/components/fairway/modules';
import type { FocusAreaCardData } from '@/components/fairway';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh }),
  useSearchParams: () => new URLSearchParams(),
}));

const actions = vi.hoisted(() => ({
  updateFocusAreaProgress: vi.fn(),
  completeFocusArea: vi.fn(),
  reactivateFocusArea: vi.fn(),
}));
vi.mock('@/app/golf/actions/development', () => actions);

const toast = vi.hoisted(() => ({ success: vi.fn(), danger: vi.fn() }));
vi.mock('@/components/fairway/feedback', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/fairway/feedback')>()),
  fairwayToast: toast,
}));

import { HubPlanBoard, parseProgressValue } from '../HubPlanBoard';

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

const lag: FocusAreaCardData = {
  id: 'fa-1',
  area_type: 'putting',
  title: 'Lag putting',
  status: 'active',
  baseline_value: 60,
  current_value: 62,
  target_value: 70,
};

function renderBoard(areas: FocusAreaCardData[] = [lag]) {
  window.history.replaceState(null, '', '/golf/dashboard/coachhelm');
  return render(
    <StageRouter
      param="view"
      homeKey="home"
      views={[
        { key: 'home', node: <HubPlanBoard areas={areas} /> },
        { key: 'development', node: <p>Development view</p> },
      ]}
    />,
  );
}

const status = (id = 'fa-1') =>
  document.querySelector(`[data-plan-row="${id}"] [data-slot="plan-status"]`)?.textContent;

function openRow(name = /lag putting/i) {
  fireEvent.click(screen.getByRole('button', { name }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('parseProgressValue', () => {
  it('uses the Log progress drawer’s rules', () => {
    expect(parseProgressValue('')).toEqual({ error: 'Enter a new value to log.' });
    expect(parseProgressValue('abc')).toEqual({ error: 'Enter a number (e.g. 31.5).' });
    expect(parseProgressValue('-1')).toHaveProperty('error');
    expect(parseProgressValue('100001')).toHaveProperty('error');
    expect(parseProgressValue(' 31.5 ')).toEqual({ value: 31.5 });
  });
});

describe('HubPlanBoard', () => {
  it('opens a row in place with no primary button', () => {
    renderBoard();
    expect(status()).toBe('20% of the way');
    const row = screen.getByRole('button', { name: /lag putting/i });
    expect(row).toHaveAttribute('aria-expanded', 'false');
    openRow();
    expect(row).toHaveAttribute('aria-expanded', 'true');
    const form = screen.getByRole('form', { name: 'Update Lag putting' });
    expect(within(form).getByRole('button', { name: 'Save progress' })).toBeInTheDocument();
    expect(within(form).getByRole('button', { name: 'Mark complete' })).toBeInTheDocument();
    // Button renders data-variant; none of the plan controls may be primary.
    for (const b of screen.getAllByRole('button')) {
      expect(b.getAttribute('data-variant')).not.toBe('primary');
    }
  });

  it('validates before writing', () => {
    renderBoard();
    openRow();
    fireEvent.click(screen.getByRole('button', { name: 'Save progress' }));
    expect(screen.getByText('Enter a new value to log.')).toBeInTheDocument();
    expect(actions.updateFocusAreaProgress).not.toHaveBeenCalled();
  });

  it('moves the bar before the server answers, and keeps it on success', async () => {
    const d = deferred<{ success: boolean; error?: string }>();
    actions.updateFocusAreaProgress.mockReturnValueOnce(d.promise);
    renderBoard();
    openRow();
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '66' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save progress' }));

    expect(actions.updateFocusAreaProgress).toHaveBeenCalledWith('fa-1', 66);
    expect(status()).toBe('60% of the way');
    expect(screen.getByRole('button', { name: 'Save progress' })).toHaveAttribute('aria-busy', 'true');

    await act(async () => d.resolve({ success: true }));
    expect(toast.success).toHaveBeenCalledWith('Progress updated', expect.anything());
    expect(refresh).toHaveBeenCalled();
    expect(toast.danger).not.toHaveBeenCalled();
  });

  it('rolls the bar back and says why when the server refuses', async () => {
    const d = deferred<{ success: boolean; error?: string }>();
    actions.updateFocusAreaProgress.mockReturnValueOnce(d.promise);
    renderBoard();
    openRow();
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '66' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save progress' }));
    expect(status()).toBe('60% of the way');

    await act(async () => d.resolve({ success: false, error: 'Forbidden' }));
    expect(status()).toBe('20% of the way');
    expect(toast.danger).toHaveBeenCalledWith('Forbidden');
    expect(refresh).not.toHaveBeenCalled();
    // The draft survives so the player can retry.
    expect(screen.getByRole('spinbutton')).toHaveValue(66);
  });

  it('removes a completed row at once, and brings it back on failure', async () => {
    const d = deferred<{ success: boolean; error?: string }>();
    actions.completeFocusArea.mockReturnValueOnce(d.promise);
    renderBoard();
    openRow();
    fireEvent.click(screen.getByRole('button', { name: 'Mark complete' }));
    expect(actions.completeFocusArea).toHaveBeenCalledWith('fa-1');
    expect(screen.queryByRole('button', { name: /lag putting/i })).toBeNull();

    await act(async () => d.resolve({ success: false }));
    expect(screen.getByRole('button', { name: /lag putting/i })).toBeInTheDocument();
    expect(toast.danger).toHaveBeenCalledWith('Failed to mark complete');
  });

  it('offers Undo on complete, which reopens with the existing action', async () => {
    actions.completeFocusArea.mockResolvedValueOnce({ success: true });
    actions.reactivateFocusArea.mockResolvedValueOnce({ success: true });
    renderBoard();
    openRow();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Mark complete' }));
    });
    expect(toast.success).toHaveBeenCalledWith(
      'Marked complete',
      expect.objectContaining({ action: expect.objectContaining({ label: 'Undo' }) }),
    );
    const undo = toast.success.mock.calls[0]![1].action.onClick as () => void;
    await act(async () => undo());
    expect(actions.reactivateFocusArea).toHaveBeenCalledWith('fa-1');
  });

  it('a thrown write is a failure too', async () => {
    actions.updateFocusAreaProgress.mockRejectedValueOnce(new Error('network'));
    renderBoard();
    openRow();
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '64' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save progress' }));
    });
    expect(status()).toBe('20% of the way');
    expect(toast.danger).toHaveBeenCalledWith('Failed to log progress');
  });

  it('does not open a row the server would refuse to write', () => {
    renderBoard([{ ...lag, id: 'fa-2', title: 'Proposed', status: 'proposed' }]);
    expect(screen.queryByRole('button', { name: /proposed/i })).toBeNull();
    expect(screen.getByText('Proposed')).toBeInTheDocument();
  });

  it('keeps the link to the full plan', () => {
    renderBoard();
    fireEvent.click(screen.getByRole('button', { name: /open your plan/i }));
    expect(screen.getByText('Development view')).toBeInTheDocument();
  });
});

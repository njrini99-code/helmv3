import { describe, it, expect, vi } from 'vitest';
import { render, screen, renderHook, act, fireEvent } from '@testing-library/react';
import { EventEditorStages } from '../EventEditorStages';
import { useEventEditorStages, EDITOR_STAGES } from '../useEventEditorStages';

describe('useEventEditorStages', () => {
  it('starts at essentials and advances only when the current stage validates', () => {
    let valid = false;
    const { result, rerender } = renderHook(
      ({ canContinue }) => useEventEditorStages({ resetKey: 'a', canContinue }),
      { initialProps: { canContinue: () => valid } },
    );
    expect(result.current.stage).toBe('essentials');

    act(() => result.current.next());
    expect(result.current.stage).toBe('essentials'); // blocked — essentials invalid

    valid = true;
    rerender({ canContinue: () => valid });
    act(() => result.current.next());
    expect(result.current.stage).toBe('people-time');

    act(() => result.current.next());
    expect(result.current.stage).toBe('review');
    expect(result.current.isLast).toBe(true);

    act(() => result.current.back());
    expect(result.current.stage).toBe('people-time');
  });

  it('resets to essentials when resetKey changes (a fresh open)', () => {
    const { result, rerender } = renderHook(
      ({ resetKey }) => useEventEditorStages({ resetKey, canContinue: () => true }),
      { initialProps: { resetKey: 'evt-1' } },
    );
    act(() => result.current.next());
    act(() => result.current.next());
    expect(result.current.stage).toBe('review');

    rerender({ resetKey: 'evt-2' });
    expect(result.current.stage).toBe('essentials');
  });

  it('goTo jumps directly regardless of validity', () => {
    const { result } = renderHook(() => useEventEditorStages({ resetKey: 'a', canContinue: () => false }));
    act(() => result.current.goTo('review'));
    expect(result.current.stage).toBe('review');
  });
});

describe('EventEditorStages', () => {
  function renderDock(overrides: Partial<React.ComponentProps<typeof EventEditorStages>> = {}) {
    const onBack = vi.fn();
    const onContinue = vi.fn();
    const onGoTo = vi.fn();
    render(
      <EventEditorStages
        stage="essentials"
        stages={EDITOR_STAGES}
        stageIndex={0}
        isFirst
        isLast={false}
        canContinueNow={false}
        onBack={onBack}
        onContinue={onContinue}
        onGoTo={onGoTo}
        {...overrides}
      />,
    );
    return { onBack, onContinue, onGoTo };
  }

  it('marks the active dot with aria-current="step" and disables Back on the first stage', () => {
    renderDock();
    expect(screen.getByRole('button', { name: 'Go to Essentials' })).toHaveAttribute('aria-current', 'step');
    expect(screen.getByRole('button', { name: 'Go to People & time' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();
  });

  it('disables Continue until the stage validates', () => {
    renderDock({ canContinueNow: false });
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  });

  it('calls onContinue once the stage validates', () => {
    const { onContinue } = renderDock({ canContinueNow: true });
    const continueButton = screen.getByRole('button', { name: 'Continue' });
    expect(continueButton).toBeEnabled();
    fireEvent.click(continueButton);
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('hides Continue on the last (review) stage', () => {
    renderDock({ stage: 'review', stageIndex: 2, isFirst: false, isLast: true, canContinueNow: true });
    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back' })).toBeEnabled();
  });

  it('a dot click calls onGoTo with that stage key', () => {
    const { onGoTo } = renderDock();
    fireEvent.click(screen.getByRole('button', { name: 'Go to Review' }));
    expect(onGoTo).toHaveBeenCalledWith('review');
  });

  it('renders correctly at a 320px mobile width', () => {
    const originalInnerWidth = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { value: 320, configurable: true, writable: true });
    try {
      renderDock();
      expect(screen.getByRole('group', { name: 'Event editor steps' })).toBeInTheDocument();
    } finally {
      Object.defineProperty(window, 'innerWidth', { value: originalInnerWidth, configurable: true, writable: true });
    }
  });
});

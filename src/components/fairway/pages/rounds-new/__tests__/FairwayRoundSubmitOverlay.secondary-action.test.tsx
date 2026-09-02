/**
 * C3: the submit-error overlay needs a distinct escape hatch for a refusal
 * that retrying can never clear (e.g. the qualifier this round targets was
 * closed) — separate from the generic "Retry submit" / "Save & exit" /
 * "Discard round" actions every other failure already has.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FairwayRoundSubmitOverlay } from '../FairwayRoundSubmitOverlay';

const baseProps = {
  isVisible: true,
  totalScore: 72,
  toPar: 0,
  courseName: 'Test Course',
  error: 'This qualifier has already been completed. Rounds can no longer be submitted.',
  onGoBack: () => {},
};

describe('FairwayRoundSubmitOverlay — secondary action (C3)', () => {
  it('renders the secondary action button and fires the callback when provided', () => {
    const onSecondaryAction = vi.fn();
    render(
      <FairwayRoundSubmitOverlay
        {...baseProps}
        secondaryActionLabel="Save as practice round"
        onSecondaryAction={onSecondaryAction}
      />,
    );

    const button = screen.getByRole('button', { name: 'Save as practice round' });
    fireEvent.click(button);
    expect(onSecondaryAction).toHaveBeenCalledTimes(1);
  });

  it('renders no secondary action button when not provided (every existing caller)', () => {
    render(<FairwayRoundSubmitOverlay {...baseProps} onRetry={() => {}} onSaveAndExit={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Save as practice round' })).toBeNull();
  });
});

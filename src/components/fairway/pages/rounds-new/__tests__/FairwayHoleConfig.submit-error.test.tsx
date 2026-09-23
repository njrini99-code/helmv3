/**
 * A round-start failure must be visible where the player tapped. The setup
 * screen used to render the parent's error ABOVE the scorecard — on a phone
 * that is a full 18-hole editor above the "Start round" dock, so a failed
 * start read as "it tries to load, then resets, no error message" (UNCW,
 * Oviinbyrd GC, 2026-09-17). The editor now takes the failure as
 * `submitError`, renders it beside its own dock, and scrolls it into view;
 * `submitting` disables the dock while the parent is persisting.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FairwayHoleConfig } from '../FairwayHoleConfig';

const nineHoles = Array.from({ length: 9 }, (_, i) => ({ holeNumber: i + 1, par: 4, yardage: 400 }));

describe('FairwayHoleConfig — start failure beside the dock', () => {
  beforeEach(() => {
    // jsdom has no layout; the component calls it on the notice's element.
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('renders the parent start failure as an alert next to Start round and scrolls it into view', () => {
    const { rerender } = render(
      <FairwayHoleConfig courseName="Oviinbyrd Golf Club" holesPerRound={9} initialHoles={nineHoles} onSave={vi.fn()} onBack={vi.fn()} />,
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    rerender(
      <FairwayHoleConfig
        courseName="Oviinbyrd Golf Club"
        holesPerRound={9}
        initialHoles={nineHoles}
        onSave={vi.fn()}
        onBack={vi.fn()}
        submitError="Unable to save this round. Please try again before tracking."
      />,
    );

    // InlineNotice's danger tone is itself the `role="alert"` — one alert, not two.
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Unable to start round');
    expect(alert).toHaveTextContent('Unable to save this round');
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
    // The notice is rendered in the dock's own stacking order — immediately
    // before the Back/Start controls, not above the scorecard.
    const start = screen.getByText('Start round →');
    expect(alert.compareDocumentPosition(start) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('disables and relabels Start round while the parent is persisting', () => {
    const onSave = vi.fn();
    render(
      <FairwayHoleConfig courseName="Oviinbyrd Golf Club" holesPerRound={9} initialHoles={nineHoles} onSave={onSave} onBack={vi.fn()} submitting />,
    );
    const start = screen.getByRole('button', { name: /Starting…/ });
    expect(start).toBeDisabled();
    fireEvent.click(start);
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Back/ })).toBeDisabled();
  });
});

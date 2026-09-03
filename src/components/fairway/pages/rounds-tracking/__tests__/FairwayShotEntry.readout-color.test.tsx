/**
 * MOBILE_VIEWPORT_AUDIT_2026-09-02.md, player follow-up, 4b nit: when
 * "Distance remaining (yds)" is invalid (red border + "Please enter a valid
 * distance", Next Shot disabled), the auto-computed "Shot distance ~N yds"
 * readout below it still rendered in the positive/success accent-700 ink,
 * undercutting the error state right above it. The readout must fall back to
 * the neutral/muted text token while the field is invalid, and keep the
 * normal success-toned ink once the value is valid again.
 */
import { render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { FairwayShotEntry } from '../FairwayShotEntry';
import type { RoundHole, ShotRecord } from '@/lib/types/golf';

function baseProps() {
  const currentHole: RoundHole = { number: 1, par: 4, yardage: 400, score: null } as RoundHole;
  return {
    currentHole,
    currentShot: 2,
    shotHistory: [] as ShotRecord[],
    isTeeShot: false,
    isPutting: false,
    isApproachOrAroundGreen: false,
    usedDriver: null,
    resultOfShot: 'fairway' as ShotRecord['result'],
    missDirection: null,
    puttBreak: null,
    puttSlope: null,
    puttMissTags: [],
    approachMissDirection: null,
    distanceToHole: 150,
    distanceUnit: 'yards' as const,
    distanceAfterUnit: 'yards' as const,
    isHoleComplete: false,
    undoSaving: false,
    showUndoConfirm: false,
    distanceInputRef: createRef<HTMLInputElement>(),
    dispatch: vi.fn(),
    onResultSelect: vi.fn(),
    onNextShot: vi.fn(),
    onAddPenalty: vi.fn(),
    onUndoLastShot: vi.fn(),
  };
}

function getShotDistanceValueEl() {
  const label = screen.getByText('Shot distance');
  const row = label.parentElement;
  if (!row) throw new Error('Shot distance readout row not found');
  const value = row.children[1];
  if (!value) throw new Error('Shot distance readout value not found');
  return value as HTMLElement;
}

describe('FairwayShotEntry — Shot distance readout color follows validity', () => {
  it('renders the readout in the neutral/muted token, not the success color, while the distance is invalid', () => {
    const props = baseProps();
    render(
      <FairwayShotEntry
        {...props}
        distanceAfterShot="-5"
        isReadyForNextShot={() => false}
      />,
    );

    // Sanity: this really is the invalid state the audit describes.
    expect(screen.getByText('Please enter a valid distance')).toBeInTheDocument();

    const value = getShotDistanceValueEl();
    expect(value.className).toContain('text-text-tertiary');
    expect(value.className).not.toContain('text-accent-700');
  });

  it('keeps the success-toned readout once the distance is valid', () => {
    const props = baseProps();
    render(
      <FairwayShotEntry
        {...props}
        distanceAfterShot="150"
        isReadyForNextShot={() => true}
      />,
    );

    expect(screen.queryByText('Please enter a valid distance')).not.toBeInTheDocument();

    const value = getShotDistanceValueEl();
    expect(value.className).toContain('text-accent-700');
    expect(value.className).not.toContain('text-text-tertiary');
  });
});

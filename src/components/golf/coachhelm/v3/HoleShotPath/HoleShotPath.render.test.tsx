// @vitest-environment jsdom
/**
 * HoleShotPath component-render tests — tooltip data depth.
 *
 * geometry.test.ts (HoleShotPath.test.ts) pins the pure plotting math; this
 * file covers the rendered component's hover/focus tooltip, specifically the
 * richer shot fields (club_type, penalty_type, putt_break/putt_slope, notes)
 * that were mined but never surfaced before this pass.
 */

import { render, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { HoleShotPath } from './index';
import type { ShotInput } from './types';

describe('HoleShotPath — tooltip data depth', () => {
  it('shows club_type, penalty_type (not the generic "penalty"), putt_break/slope on green shots, and notes', async () => {
    const shots: ShotInput[] = [
      {
        shot_number: 1,
        lie_after: 'fairway',
        distance_to_hole_after: 150,
        distance_to_hole_before: 400,
        club_type: 'driver',
      },
      {
        shot_number: 2,
        lie_after: 'water',
        distance_to_hole_after: 100,
        distance_to_hole_before: 150,
        is_penalty: true,
        penalty_type: 'water',
        notes: 'Pulled left of the tree line.',
      },
      {
        shot_number: 3,
        lie_after: 'green',
        distance_to_hole_after: 10,
        distance_to_hole_before: 100,
        putt_break: 'right_to_left',
        putt_slope: 'uphill',
      },
    ];

    const { container, findByText, queryByText } = render(
      <HoleShotPath hole_number={5} par={4} score={5} shots={shots} size="card" />,
    );

    const dots = container.querySelectorAll('[tabindex="0"]');
    expect(dots).toHaveLength(3);

    // Shot 1 — club_type label.
    fireEvent.focus(dots[0]!);
    expect(await findByText(/Driver/)).toBeInTheDocument();

    // Shot 2 — penalty_type replaces the generic "penalty" label, and the
    // free-text note renders.
    fireEvent.focus(dots[1]!);
    expect(await findByText(/penalty: water/)).toBeInTheDocument();
    expect(await findByText(/Pulled left of the tree line/)).toBeInTheDocument();

    // Shot 3 — putt_break/slope only for a green-lie shot.
    fireEvent.focus(dots[2]!);
    expect(await findByText(/Right-to-left break/)).toBeInTheDocument();
    expect(queryByText(/uphill/)).toBeInTheDocument();
  });

  it('omits putt_break/slope for a non-green shot even when logged (stale data guard)', async () => {
    const shots: ShotInput[] = [
      {
        shot_number: 1,
        lie_after: 'fairway',
        distance_to_hole_after: 150,
        // Should never happen from real data, but the component must not
        // surface a green-read line for a fairway shot if it does.
        putt_break: 'straight',
      },
    ];
    const { container, findByText, queryByText } = render(
      <HoleShotPath hole_number={2} par={4} shots={shots} size="card" />,
    );
    const dot = container.querySelector('[tabindex="0"]')!;
    fireEvent.focus(dot);
    await findByText(/Shot 1/);
    expect(queryByText(/Straight putt/)).not.toBeInTheDocument();
  });

  it('suppresses the "No shots logged" empty-state caption at strip size (too narrow to hold it)', () => {
    const { container, queryByText } = render(
      <HoleShotPath hole_number={1} par={4} shots={[]} size="strip" />,
    );
    expect(queryByText(/No shots logged/)).not.toBeInTheDocument();
    // The turf/pin visual still renders as the honest empty state.
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('still shows "No shots logged" at card size (room for the caption)', () => {
    const { queryByText } = render(
      <HoleShotPath hole_number={1} par={4} shots={[]} size="card" />,
    );
    expect(queryByText(/No shots logged/)).toBeInTheDocument();
  });
});

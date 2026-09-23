// @vitest-environment jsdom
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Segmented, TRACK_SUNKEN_SHADOW, type SegmentedOption } from './segmented';

const VIEW_OPTIONS: ReadonlyArray<SegmentedOption> = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
];

describe('Segmented — quiet', () => {
  // Priority 1: `quiet` is opt-in and 58 call sites render <Segmented> without
  // it. The default (undefined) path must keep the carved sunken track — the
  // exact inline boxShadow the ternary at the track applies when NOT quiet —
  // and must never carry the quiet presentational hook.
  it('defaults to the sunken track (boxShadow set, no data-quiet) when the quiet prop is omitted', () => {
    render(
      <Segmented options={VIEW_OPTIONS} value="day" onValueChange={() => {}} aria-label="Calendar view" />,
    );
    const track = screen.getByRole('radiogroup', { name: 'Calendar view' });
    expect(track.style.boxShadow).toBe(TRACK_SUNKEN_SHADOW);
    expect(track).not.toHaveAttribute('data-quiet');
  });

  // Priority 2: the doc comment claims selection, keyboard, and accessible
  // semantics are IDENTICAL with `quiet` set. Drive the control for real and
  // check the same observable contract the non-quiet tests already pin.
  it('keeps selection, click activation, and radiogroup/radio semantics identical with quiet set', async () => {
    const onValueChange = vi.fn();
    render(
      <Segmented
        options={VIEW_OPTIONS}
        value="day"
        onValueChange={onValueChange}
        quiet
        aria-label="Calendar view"
      />,
    );

    expect(screen.getAllByRole('radio')).toHaveLength(VIEW_OPTIONS.length);
    expect(screen.getByRole('radio', { name: 'Day' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Week' })).toHaveAttribute('aria-checked', 'false');

    await userEvent.click(screen.getByRole('radio', { name: 'Week' }));
    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenCalledWith('week');
  });

  it('moves the checked radio via keyboard with quiet set, same as the default control', async () => {
    const Controlled = () => {
      const [value, setValue] = useState('day');
      return (
        <Segmented
          options={VIEW_OPTIONS}
          value={value}
          onValueChange={setValue}
          quiet
          aria-label="Calendar view"
        />
      );
    };
    render(<Controlled />);

    // Tab into the group first (real keyboard flow) rather than calling
    // `.focus()` directly — Radix's roving-focus tabIndex bookkeeping updates
    // state outside of React's test `act()` batching when focus is forced.
    await userEvent.tab();
    expect(screen.getByRole('radio', { name: 'Day' })).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}{Enter}');

    expect(screen.getByRole('radio', { name: 'Week' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Day' })).toHaveAttribute('aria-checked', 'false');
  });

  // Priority 3: the one documented presentational hook — `data-quiet` on the
  // track — plus the branch it gates: quiet drops the sunken inset shadow
  // entirely rather than applying a lighter one.
  it('marks the track data-quiet and drops the sunken boxShadow entirely', () => {
    render(
      <Segmented options={VIEW_OPTIONS} value="day" onValueChange={() => {}} quiet aria-label="Calendar view" />,
    );
    const track = screen.getByRole('radiogroup', { name: 'Calendar view' });
    expect(track).toHaveAttribute('data-quiet', '');
    expect(track.style.boxShadow).toBe('');
  });
});

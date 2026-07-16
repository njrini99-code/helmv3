// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Segmented, type SegmentedOption } from './segmented';

// The real 9-category Documents filter (and the shape of the Passport
// per-field visibility rows) — this is the exact option count that renders
// as illegible 1-character pills at 390px if the item is allowed to shrink
// below its content width.
const NINE_OPTIONS: ReadonlyArray<SegmentedOption> = [
  { value: 'all', label: 'All' },
  { value: 'general', label: 'General' },
  { value: 'playbook', label: 'Playbook' },
  { value: 'rules', label: 'Rules' },
  { value: 'conditioning', label: 'Conditioning' },
  { value: 'scouting', label: 'Scouting' },
  { value: 'academic', label: 'Academic' },
  { value: 'administrative', label: 'Administrative' },
  { value: 'media', label: 'Media' },
];

describe('Segmented', () => {
  it('renders every option label in full, uncut', () => {
    render(
      <Segmented options={NINE_OPTIONS} value="all" onValueChange={() => {}} aria-label="Filter by category" />,
    );
    for (const opt of NINE_OPTIONS) {
      expect(screen.getByText(opt.label as string)).toBeInTheDocument();
    }
  });

  // Regression pin (Lane 4 / segmented-primitive fix): the item must never
  // carry `min-w-0` again. That class overrides the flex item's default
  // `min-width: auto` floor, which is exactly what let every segment shrink
  // to ~1 character wide at 390px instead of the row overflowing into the
  // track's `overflow-x-auto` + useScrollFade affordance it was designed for.
  it('never applies min-w-0 to a segment item, and pins it at its content width via flex-shrink-0 when not full-width', () => {
    render(
      <Segmented options={NINE_OPTIONS} value="all" onValueChange={() => {}} aria-label="Filter by category" />,
    );
    const items = screen.getAllByRole('radio');
    expect(items).toHaveLength(NINE_OPTIONS.length);
    for (const item of items) {
      expect(item.className).not.toMatch(/(^|\s)min-w-0(\s|$)/);
      expect(item.className).toMatch(/(^|\s)flex-shrink-0(\s|$)/);
    }
  });

  it('never truncates the label span (no `truncate`/`min-w-0`); keeps it on one line', () => {
    render(
      <Segmented options={NINE_OPTIONS} value="all" onValueChange={() => {}} aria-label="Filter by category" />,
    );
    const label = screen.getByText('Administrative');
    expect(label.className).not.toMatch(/truncate/);
    expect(label.className).not.toMatch(/min-w-0/);
    expect(label.className).toMatch(/(^|\s)whitespace-nowrap(\s|$)/);
  });

  it('fullWidth grows segments to share the row (flex-1) instead of pinning flex-shrink-0, and still never applies min-w-0', () => {
    const twoOptions: ReadonlyArray<SegmentedOption> = [
      { value: 'front', label: 'Front 9' },
      { value: 'back', label: 'Back 9' },
    ];
    render(
      <Segmented
        options={twoOptions}
        value="front"
        onValueChange={() => {}}
        fullWidth
        aria-label="Nine selection"
      />,
    );
    const items = screen.getAllByRole('radio');
    for (const item of items) {
      expect(item.className).toMatch(/(^|\s)flex-1(\s|$)/);
      expect(item.className).not.toMatch(/(^|\s)min-w-0(\s|$)/);
    }
  });

  it('fires onValueChange with the clicked option, never with an empty string', async () => {
    const onValueChange = vi.fn();
    render(
      <Segmented
        options={[
          { value: 'day', label: 'Day' },
          { value: 'week', label: 'Week' },
        ]}
        value="day"
        onValueChange={onValueChange}
        aria-label="Calendar view"
      />,
    );
    await userEvent.click(screen.getByRole('radio', { name: 'Week' }));
    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenCalledWith('week');
  });

  it('marks the selected option checked and exposes the group aria-label', () => {
    render(
      <Segmented
        options={[
          { value: 'day', label: 'Day' },
          { value: 'week', label: 'Week' },
        ]}
        value="week"
        onValueChange={() => {}}
        aria-label="Calendar view"
      />,
    );
    expect(screen.getByRole('radiogroup', { name: 'Calendar view' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Week' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Day' })).toHaveAttribute('aria-checked', 'false');
  });
});

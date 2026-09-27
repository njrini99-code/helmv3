// @vitest-environment jsdom
/**
 * BriefBand — frosted light masthead (owner redesign 2026-09). Pins the
 * shared frosted surface, dark text, and that the Scan team button still
 * fires onScan and reflects its busy state.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FROSTED_CARD_CLASS } from '@/components/fairway/modules/frosted';
import { BriefBand } from '../BriefBand';
import type { BriefCounts } from '../buildTriageViewModel';

const counts: BriefCounts = { urgent: 3, playersFlagged: 5 };

describe('BriefBand', () => {
  it('renders on the shared frosted surface with dark text, not the dark green slab', () => {
    const { container } = render(
      <BriefBand verdict="Three players need you today." counts={counts} lastScanLabel="last scan 2h ago" scanning={false} onScan={() => {}} />,
    );
    const band = container.querySelector('[data-slot="brief-band"]')!;
    for (const cls of FROSTED_CARD_CLASS.split(' ')) expect(band.classList).toContain(cls);
    expect(band.className).not.toMatch(/from-accent-900/);
    expect(screen.getByText('Three players need you today.').className).toMatch(/text-text-primary/);
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('Players flagged')).toBeInTheDocument();
  });

  it('keeps the Scan team action and its busy state', () => {
    const onScan = vi.fn();
    const { rerender } = render(
      <BriefBand verdict="v" counts={counts} lastScanLabel="l" scanning={false} onScan={onScan} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Scan team for new signals' }));
    expect(onScan).toHaveBeenCalledTimes(1);
    rerender(<BriefBand verdict="v" counts={counts} lastScanLabel="l" scanning onScan={onScan} />);
    expect(screen.getByRole('button', { name: 'Scanning team for new signals' })).toBeDisabled();
  });
});

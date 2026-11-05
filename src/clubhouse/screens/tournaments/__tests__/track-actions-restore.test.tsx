// @vitest-environment jsdom
import type React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const action = vi.hoisted(() => ({ setCancelled: vi.fn(async () => ({ success: true })) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/app/golf/actions/tournaments-calendar', () => ({ setTournamentCancelled: action.setCancelled, untrackTournament: vi.fn() }));
vi.mock('../../../ui/Toast', () => ({ useToast: () => vi.fn() }));
vi.mock('../paths', () => ({ useTourPaths: () => ({}) }));
vi.mock('../../../ui/Modal', () => ({
  Modal: ({ open, children, footer }: { open: boolean; children?: React.ReactNode; footer?: React.ReactNode }) =>
    open ? (
      <div>
        {children}
        {footer}
      </div>
    ) : null,
}));
vi.mock('../../../ui/Menu', () => ({
  Menu: ({ items }: { items: Array<{ label: string; onSelect: () => void }> }) => (
    <div>
      {items.map((i) => (
        <button key={i.label} type="button" onClick={i.onSelect}>
          {i.label}
        </button>
      ))}
    </div>
  ),
}));

import { DeskTrackMenu } from '../track-actions';
import type { ChTourTrack } from '../types';

const track = (cancelled: boolean) => ({ cancelled, version: 1, official: false, scoredRound: null }) as unknown as ChTourTrack;

afterEach(cleanup);

describe('the desk menu after a cancel and a restore', () => {
  it('offers Cancel again once the restored row says it is not cancelled', async () => {
    const { rerender } = render(<DeskTrackMenu tournamentId="t1" name="Pinehurst" track={track(false)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel tournament' }));
    const confirm = screen.getAllByRole('button', { name: 'Cancel tournament' }).at(-1)!;
    await act(async () => void fireEvent.click(confirm));
    // The held cancel shows at once, and the server row follows.
    rerender(<DeskTrackMenu tournamentId="t1" name="Pinehurst" track={track(true)} />);
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Restore tournament' })));
    rerender(<DeskTrackMenu tournamentId="t1" name="Pinehurst" track={track(false)} />);
    expect(screen.getByRole('button', { name: 'Cancel tournament' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Restore tournament' })).toBeNull();
  });
});

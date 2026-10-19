/**
 * FairwayUnfinishedBanner — Discard takes the round screen's discard path.
 *
 * The round screen's Discard (use-continue-round-session handleDeleteRound)
 * marks the round discarded on this device and drops its offline-queue copy
 * after the server delete succeeds, so no other tab and no failed-submit
 * entry can bring it back. The library banner's Discard used to stop at the
 * emergency-save clear.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const deleteInProgressRound = vi.fn();
const clearEmergencySave = vi.fn();
const markRoundDiscarded = vi.fn();
const deleteOfflineRound = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('@/app/golf/actions/round-partial', () => ({
  deleteInProgressRound: (...args: unknown[]) => deleteInProgressRound(...args),
}));
vi.mock('@/lib/utils/emergency-save', () => ({
  clearEmergencySave: (...args: unknown[]) => clearEmergencySave(...args),
  markRoundDiscarded: (...args: unknown[]) => markRoundDiscarded(...args),
}));
vi.mock('@/lib/offline/indexed-db', () => ({
  deleteOfflineRound: (...args: unknown[]) => deleteOfflineRound(...args),
}));

import { FairwayUnfinishedBanner } from '../FairwayUnfinishedBanner';
import type { RoundLibraryRound } from '../FairwayRoundsLibrary';

const round: RoundLibraryRound = {
  id: 'round-1',
  course_name: 'Pebble Beach Golf Links',
  course_city: 'Pebble Beach',
  course_state: 'CA',
  round_date: '2026-09-20',
  round_type: 'practice',
  total_score: null,
  score_to_par: null,
  total_putts: null,
  total_fairways: null,
  total_fairways_hit: null,
  total_gir: null,
  total_gir_possible: null,
  holes_played: 18,
  status: 'in_progress',
  current_hole: 4,
  updated_at: '2026-09-20T18:00:00.000Z',
  created_at: '2026-09-20T14:00:00.000Z',
  player: { first_name: 'Nick', last_name: 'Rini', avatar_url: null },
};

function discard() {
  render(<FairwayUnfinishedBanner rounds={[round]} playerId="player-1" />);
  fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
  fireEvent.click(screen.getByRole('button', { name: /Confirm discard/ }));
}

describe('FairwayUnfinishedBanner — Discard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deleteOfflineRound.mockResolvedValue(undefined);
  });

  it('marks the round discarded and drops its offline-queue copy after the server delete', async () => {
    deleteInProgressRound.mockResolvedValue({ success: true });
    discard();

    await waitFor(() => expect(markRoundDiscarded).toHaveBeenCalledWith('round-1', 'player-1'));
    expect(clearEmergencySave).toHaveBeenCalledWith('round-1', 'player-1');
    await waitFor(() => expect(deleteOfflineRound).toHaveBeenCalledWith('round-1'));
    await waitFor(() => expect(screen.queryByText('Pebble Beach Golf Links')).not.toBeInTheDocument());
  });

  it('still removes the row when dropping the offline-queue copy fails', async () => {
    deleteInProgressRound.mockResolvedValue({ success: true });
    deleteOfflineRound.mockRejectedValue(new Error('IndexedDB unavailable'));
    discard();

    await waitFor(() => expect(deleteOfflineRound).toHaveBeenCalledWith('round-1'));
    await waitFor(() => expect(screen.queryByText('Pebble Beach Golf Links')).not.toBeInTheDocument());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('leaves the round live on this device when the server refuses the delete', async () => {
    deleteInProgressRound.mockResolvedValue({ success: false, error: 'This round can no longer be discarded.' });
    discard();

    expect(await screen.findByRole('alert')).toHaveTextContent('This round can no longer be discarded.');
    expect(markRoundDiscarded).not.toHaveBeenCalled();
    expect(deleteOfflineRound).not.toHaveBeenCalled();
    expect(clearEmergencySave).not.toHaveBeenCalled();
  });

  it('leaves the round live on this device when the delete throws', async () => {
    deleteInProgressRound.mockRejectedValue(new Error('Network down'));
    discard();

    expect(await screen.findByRole('alert')).toHaveTextContent('Network down');
    expect(markRoundDiscarded).not.toHaveBeenCalled();
    expect(deleteOfflineRound).not.toHaveBeenCalled();
  });
});

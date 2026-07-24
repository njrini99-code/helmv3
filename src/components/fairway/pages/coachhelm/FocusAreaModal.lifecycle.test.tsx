// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FocusAreaModal } from './FocusAreaModal';

const playerStats = {
  p1: {
    rounds_played: 5,
    avg_score: 78,
    avg_putts: 31,
    fairway_pct: 55,
    gir_pct: 44,
  },
  p2: {
    rounds_played: 8,
    avg_score: 75,
    avg_putts: 29,
    fairway_pct: 62,
    gir_pct: 51,
  },
};

describe('FocusAreaModal lifecycle', () => {
  it('resets the dirty baseline and custom metric mode when a reused modal reopens', async () => {
    const onOpenChange = vi.fn();
    const onSubmit = vi.fn().mockResolvedValue({ success: true });
    const { rerender } = render(
      <FocusAreaModal
        open
        onOpenChange={onOpenChange}
        mode="coach"
        editing
        players={[
          { id: 'p1', name: 'Alice' },
          { id: 'p2', name: 'Bob' },
        ]}
        playerStats={playerStats}
        playerId="p1"
        initial={{
          player_id: 'p1',
          area_type: 'driving',
          title: 'Find more fairways',
          target_metric: 'fairway_pct',
        }}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Custom metric…' }));
    expect(screen.getByPlaceholderText('e.g. Pre-shot routine consistency')).toBeInTheDocument();

    rerender(
      <FocusAreaModal
        open={false}
        onOpenChange={onOpenChange}
        mode="coach"
        editing
        players={[
          { id: 'p1', name: 'Alice' },
          { id: 'p2', name: 'Bob' },
        ]}
        playerStats={playerStats}
        playerId="p1"
        initial={{
          player_id: 'p1',
          area_type: 'driving',
          title: 'Find more fairways',
          target_metric: 'fairway_pct',
        }}
        onSubmit={onSubmit}
      />,
    );

    rerender(
      <FocusAreaModal
        open
        onOpenChange={onOpenChange}
        mode="coach"
        editing
        players={[
          { id: 'p1', name: 'Alice' },
          { id: 'p2', name: 'Bob' },
        ]}
        playerStats={playerStats}
        playerId="p2"
        initial={{
          player_id: 'p2',
          area_type: 'putting',
          title: 'Tighten lag putting',
          target_metric: 'putts_per_round',
          current_value: 29,
          target_value: 27,
        }}
        onSubmit={onSubmit}
      />,
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue('Tighten lag putting')).toBeInTheDocument();
    });
    expect(screen.queryByPlaceholderText('e.g. Pre-shot routine consistency')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByText('Discard your unsaved changes?')).not.toBeInTheDocument();
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });
});

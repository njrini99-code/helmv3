/**
 * RE-F10: par 6 could not be entered (chips were 3/4/5 while the server allows 3-6).
 * RE-F11: a tee with a missing yardage was silently filled from the template
 * (380, 420, …) — invented yardages in a real course's round. It now stays
 * blank, is flagged, and blocks Start until the player enters it.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FairwayHoleConfig } from '../FairwayHoleConfig';

const nine = (yardage: (i: number) => number) =>
  Array.from({ length: 9 }, (_, i) => ({ holeNumber: i + 1, par: 4, yardage: yardage(i) }));

function renderConfig(initialHoles: ReturnType<typeof nine> | undefined, onSave = vi.fn()) {
  render(<FairwayHoleConfig courseName="Test Links" initialHoles={initialHoles} holesPerRound={9} onSave={onSave} onBack={vi.fn()} />);
  return onSave;
}

describe('FairwayHoleConfig par options (RE-F10)', () => {
  it('offers par 6 and saves it', () => {
    const onSave = renderConfig(nine(() => 400));
    fireEvent.click(screen.getByRole('button', { name: 'Hole 3 par 6' }));
    expect(screen.getByRole('button', { name: 'Hole 3 par 6' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: /start round/i }));
    expect(onSave.mock.calls[0]![0][2]).toMatchObject({ holeNumber: 3, par: 6 });
  });
});

describe('FairwayHoleConfig missing yardage (RE-F11)', () => {
  it('leaves a baseline hole with no yardage blank and flags it, never the template value', () => {
    renderConfig(nine((i) => (i === 1 ? 0 : 400)));
    const hole2 = screen.getByRole('spinbutton', { name: 'Hole 2 yardage' }) as HTMLInputElement;
    expect(hole2.value).toBe('');
    expect(hole2).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('spinbutton', { name: 'Hole 1 yardage' })).not.toHaveAttribute('aria-invalid');
    expect(screen.getByText(/No yardage on this tee/)).toBeInTheDocument();
  });

  it('blocks Start until the missing yardage is entered', () => {
    const onSave = renderConfig(nine((i) => (i === 1 ? 0 : 400)));
    fireEvent.click(screen.getByRole('button', { name: /start round/i }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText(/Enter a yardage for hole 2 before you start/)).toBeInTheDocument();

    fireEvent.change(screen.getByRole('spinbutton', { name: 'Hole 2 yardage' }), { target: { value: '385' } });
    fireEvent.click(screen.getByRole('button', { name: /start round/i }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0]![0][1]).toMatchObject({ holeNumber: 2, yardage: 385 });
  });

  it('still uses the template when there is no baseline at all', () => {
    renderConfig(undefined);
    expect((screen.getByRole('spinbutton', { name: 'Hole 1 yardage' }) as HTMLInputElement).value).toBe('380');
    expect(screen.queryByText(/No yardage on this tee/)).not.toBeInTheDocument();
  });
});

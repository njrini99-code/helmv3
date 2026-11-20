import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Switch } from '../Switch';

vi.mock('../../lib/haptics', () => ({ haptic: vi.fn() }));

// GES-12 (premium plan batch 6): the thumb follows a drag, and letting go decides by where it stands.
describe('Switch drag (GES-12)', () => {
  const label = () => screen.getByRole('switch').closest('label')!;

  it('a drag past the middle turns it on, and the drag is not also a tap', () => {
    const onChange = vi.fn();
    render(<Switch checked={false} onChange={onChange} label="Email" />);
    fireEvent.pointerDown(label(), { clientX: 10, button: 0, pointerId: 1 });
    fireEvent.pointerMove(label(), { clientX: 25, pointerId: 1 });
    fireEvent.pointerUp(label(), { clientX: 25, pointerId: 1 });
    fireEvent.click(label());
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('a drag that goes back short of the middle changes nothing', () => {
    const onChange = vi.fn();
    render(<Switch checked={false} onChange={onChange} label="Email" />);
    fireEvent.pointerDown(label(), { clientX: 10, button: 0, pointerId: 1 });
    fireEvent.pointerMove(label(), { clientX: 16, pointerId: 1 });
    fireEvent.pointerUp(label(), { clientX: 16, pointerId: 1 });
    fireEvent.click(label());
    expect(onChange).not.toHaveBeenCalled();
  });

  it('a plain tap still flips it', () => {
    const onChange = vi.fn();
    render(<Switch checked={false} onChange={onChange} label="Email" />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './button';

vi.mock('@/lib/fairway/haptics', () => ({ fwHaptic: vi.fn() }));

describe('Fairway link button activation', () => {
  it.each(['disabled', 'busy'] as const)('blocks child and wrapper actions while %s', (state) => {
    const childClick = vi.fn();
    const wrapperClick = vi.fn();
    render(<Button asChild {...{ [state]: true }} onClick={wrapperClick}><a href="#next" onClick={childClick}>Continue</a></Button>);
    const link = screen.getByRole('link', { name: 'Continue' });
    expect(fireEvent.click(link)).toBe(false);
    expect(childClick).not.toHaveBeenCalled();
    expect(wrapperClick).not.toHaveBeenCalled();
    expect(link).toHaveAttribute('aria-disabled', 'true');
  });

  it('blocks keyboard activation while busy and restores it after completion', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn((event) => event.preventDefault());
    const { rerender } = render(<Button asChild busy><a href="#next" onClick={onClick}>Continue</a></Button>);
    screen.getByRole('link', { name: 'Continue' }).focus();
    await user.keyboard('{Enter}');
    expect(onClick).not.toHaveBeenCalled();
    rerender(<Button asChild><a href="#next" onClick={onClick}>Continue</a></Button>);
    await user.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

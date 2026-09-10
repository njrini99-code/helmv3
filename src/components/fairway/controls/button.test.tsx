import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button, IconButton } from './button';

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

describe('Fairway button depth', () => {
  it('raises primary and secondary at rest (lit top edge + resting shadow) and keeps ghost flat', () => {
    render(
      <>
        <Button variant="primary">Save</Button>
        <Button variant="secondary">Today</Button>
        <Button variant="ghost">Skip</Button>
      </>,
    );
    expect(screen.getByRole('button', { name: 'Save' }).className).toContain('inset_0_1px_0');
    expect(screen.getByRole('button', { name: 'Today' }).className).toContain('var(--fw-shadow-card)');
    expect(screen.getByRole('button', { name: 'Skip' }).className).not.toMatch(/(^|\s)(shadow-(flat|soft)|\[box-shadow:)/);
  });

  it('gives IconButton the same resting depth as Button', () => {
    render(
      <>
        <IconButton variant="primary" aria-label="Add"><svg /></IconButton>
        <IconButton variant="secondary" aria-label="More"><svg /></IconButton>
        <IconButton variant="ghost" aria-label="Close"><svg /></IconButton>
      </>,
    );
    expect(screen.getByRole('button', { name: 'Add' }).className).toContain('inset_0_1px_0');
    expect(screen.getByRole('button', { name: 'More' }).className).toContain('var(--fw-shadow-card)');
    expect(screen.getByRole('button', { name: 'Close' }).className).not.toMatch(/(^|\s)(shadow-(flat|soft)|\[box-shadow:)/);
  });
});

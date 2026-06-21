// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SelectablePill } from './selectable-pill';

describe('SelectablePill (P404)', () => {
  it('renders a real button with the default cell shape at rest', () => {
    render(<SelectablePill>1</SelectablePill>);
    const btn = screen.getByRole('button', { name: '1' });
    expect(btn.tagName).toBe('BUTTON');
    expect(btn).toHaveAttribute('type', 'button');
    // No state flags set → none of the state data-attrs present.
    expect(btn).not.toHaveAttribute('data-active');
    expect(btn).not.toHaveAttribute('data-completed');
    expect(btn).not.toHaveAttribute('data-future');
    expect(btn.className).toContain('rounded-fw-md');
  });

  it('exposes each state via a data attribute (active/completed/future/selected)', () => {
    const { rerender } = render(<SelectablePill active>2</SelectablePill>);
    expect(screen.getByRole('button')).toHaveAttribute('data-active', 'true');

    rerender(<SelectablePill completed>2</SelectablePill>);
    expect(screen.getByRole('button')).toHaveAttribute('data-completed', 'true');

    rerender(<SelectablePill future>2</SelectablePill>);
    expect(screen.getByRole('button')).toHaveAttribute('data-future', 'true');

    rerender(<SelectablePill selected>2</SelectablePill>);
    const btn = screen.getByRole('button');
    expect(btn).toHaveAttribute('data-selected', 'true');
    // selected drives aria-pressed for AT.
    expect(btn).toHaveAttribute('aria-pressed', 'true');
  });

  it('applies the active accent fill and completed tint classes', () => {
    const { rerender } = render(<SelectablePill active>3</SelectablePill>);
    expect(screen.getByRole('button').className).toContain('bg-accent-500');

    rerender(<SelectablePill completed>3</SelectablePill>);
    expect(screen.getByRole('button').className).toContain('bg-accent-50');

    rerender(<SelectablePill future>3</SelectablePill>);
    expect(screen.getByRole('button').className).toContain('bg-surface-sunken');
  });

  it('layers the selected ring on top of an active pill', () => {
    render(
      <SelectablePill active selected>
        4
      </SelectablePill>,
    );
    const cls = screen.getByRole('button').className;
    expect(cls).toContain('bg-accent-500'); // still active
    expect(cls).toContain('ring-2'); // plus the selected overlay ring
  });

  it('supports the round shape variant', () => {
    render(<SelectablePill shape="round">5</SelectablePill>);
    expect(screen.getByRole('button').className).toContain('rounded-full');
  });

  it('does not fire onClick when disabled', async () => {
    const onClick = vi.fn();
    render(
      <SelectablePill disabled onClick={onClick}>
        6
      </SelectablePill>,
    );
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    await userEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('fires onClick when enabled', async () => {
    const onClick = vi.fn();
    render(<SelectablePill onClick={onClick}>7</SelectablePill>);
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

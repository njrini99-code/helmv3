import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TimeWheel } from './wheel-picker';

describe('TimeWheel', () => {
  it('renders hour, minute and period columns with the value centred', () => {
    render(<TimeWheel value="16:41" onChange={() => {}} />);
    expect(screen.getByRole('listbox', { name: 'Hour' })).toBeInTheDocument();
    expect(screen.getByRole('listbox', { name: 'Minute' })).toBeInTheDocument();
    expect(screen.getByRole('listbox', { name: 'AM or PM' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '4', selected: true })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '41', selected: true })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'PM', selected: true })).toBeInTheDocument();
  });

  it('offers every minute, like the OS clock', () => {
    render(<TimeWheel value="09:00" onChange={() => {}} />);
    expect(screen.getByRole('option', { name: '07' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '59' })).toBeInTheDocument();
  });

  it('emits 24h HH:MM when a row is tapped', () => {
    const onChange = vi.fn();
    render(<TimeWheel value="09:30" onChange={onChange} />);
    fireEvent.click(screen.getByRole('option', { name: 'PM' }));
    expect(onChange).toHaveBeenLastCalledWith('21:30');
    fireEvent.click(within(screen.getByRole('listbox', { name: 'Hour' })).getByRole('option', { name: '12' }));
    expect(onChange).toHaveBeenLastCalledWith('00:30');
  });

  it('steps with the keyboard', () => {
    const onChange = vi.fn();
    render(<TimeWheel value="09:30" onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole('listbox', { name: 'Hour' }), { key: 'ArrowDown' });
    expect(onChange).toHaveBeenLastCalledWith('10:30');
    fireEvent.keyDown(screen.getByRole('listbox', { name: 'Minute' }), { key: 'ArrowUp' });
    expect(onChange).toHaveBeenLastCalledWith('09:29');
    fireEvent.keyDown(screen.getByRole('listbox', { name: 'Minute' }), { key: 'End' });
    expect(onChange).toHaveBeenLastCalledWith('09:59');
  });

  it('opens on the fallback when nothing is chosen yet', () => {
    render(<TimeWheel value={null} fallback="14:05" onChange={() => {}} />);
    expect(screen.getByRole('option', { name: '2', selected: true })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '05', selected: true })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'PM', selected: true })).toBeInTheDocument();
  });
});

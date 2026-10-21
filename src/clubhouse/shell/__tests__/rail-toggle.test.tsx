import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, beforeEach } from 'vitest';
import { RailToggle } from '../RailToggle';

function Harness({ start = false }: { start?: boolean }) {
  const [folded, setFolded] = useState(start);
  return (
    <div className="ch-app" data-ch-rail={folded ? 'folded' : undefined} data-testid="app">
      <RailToggle folded={folded} onFold={setFolded} />
    </div>
  );
}

describe('RailToggle', () => {
  beforeEach(() => {
    document.cookie = 'ch_rail=; path=/; max-age=0';
  });

  it('folds the sidebar, says so, and remembers it in the cookie', () => {
    render(<Harness />);
    const button = screen.getByRole('button', { name: 'Collapse sidebar' });
    expect(button.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(button);
    expect(screen.getByTestId('app').getAttribute('data-ch-rail')).toBe('folded');
    expect(screen.getByRole('button', { name: 'Expand sidebar' }).getAttribute('aria-expanded')).toBe('false');
    expect(document.cookie).toContain('ch_rail=1');
  });

  it('opens again from the rail', () => {
    render(<Harness start />);
    fireEvent.click(screen.getByRole('button', { name: 'Expand sidebar' }));
    expect(screen.getByTestId('app').hasAttribute('data-ch-rail')).toBe(false);
    expect(document.cookie).toContain('ch_rail=0');
  });

  it('toggles with Cmd or Ctrl and backslash, and ignores the key alone', () => {
    render(<Harness />);
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '\\' }));
    });
    expect(screen.getByTestId('app').hasAttribute('data-ch-rail')).toBe(false);
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '\\', metaKey: true }));
    });
    expect(screen.getByTestId('app').getAttribute('data-ch-rail')).toBe('folded');
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '\\', ctrlKey: true }));
    });
    expect(screen.getByTestId('app').hasAttribute('data-ch-rail')).toBe(false);
  });
});

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DataTable } from '../chat/Evidence';

// F-0042: the evidence table's sideways scroller is a named region a keyboard can reach.
describe('evidence table', () => {
  it('scrolls inside a focusable region named by its caption', () => {
    render(<DataTable table={{ caption: 'Putting by round', columns: ['Round', 'Putts'], rows: [['Oct 12', '31']] } as never} />);
    const region = screen.getByRole('region', { name: /scrolls sideways/ });
    expect(region.getAttribute('aria-label')).toBe('Putting by round, scrolls sideways');
    expect(region.tabIndex).toBe(0);
    expect(region.classList.contains('ch-th-tablewrap')).toBe(true);
  });
});

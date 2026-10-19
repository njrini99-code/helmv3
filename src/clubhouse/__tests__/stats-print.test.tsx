// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PrintHead, usePrinting } from '../screens/stats/PrintHead';

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute('data-fw-theme');
});

function Probe() {
  return <p>{usePrinting() ? 'paper' : 'screen'}</p>;
}

describe('printing a stats page', () => {
  it('the page knows it is on paper between beforeprint and afterprint', () => {
    render(<Probe />);
    expect(screen.getByText('screen')).toBeTruthy();
    act(() => void window.dispatchEvent(new Event('beforeprint')));
    expect(screen.getByText('paper')).toBeTruthy();
    act(() => void window.dispatchEvent(new Event('afterprint')));
    expect(screen.getByText('screen')).toBeTruthy();
  });

  it('the head says Golfhelm, who the figures are for and the day; paper is light, and the theme comes back afterwards', () => {
    document.documentElement.setAttribute('data-fw-theme', 'dark');
    const { container } = render(<PrintHead subject="Varsity · Fall 2026 · Team stats" />);
    const head = container.querySelector('.ch-st-print')!;
    expect(head.textContent).toContain('Golfhelm');
    expect(head.textContent).toContain('Varsity · Fall 2026 · Team stats');
    expect(head.textContent).toMatch(/[A-Z][a-z]+ \d{1,2}, \d{4}/);
    act(() => void window.dispatchEvent(new Event('beforeprint')));
    expect(document.documentElement.getAttribute('data-fw-theme')).toBeNull();
    act(() => void window.dispatchEvent(new Event('afterprint')));
    expect(document.documentElement.getAttribute('data-fw-theme')).toBe('dark');
  });
});

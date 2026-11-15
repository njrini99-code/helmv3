import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), usePathname: () => '/golf/dashboard', useSearchParams: () => new URLSearchParams() }));

import { PREVIEW_HOME } from '../../../preview/fixtures';
import { TeamScoring, teamDays } from '../TeamScoring';

/**
 * W3 (owner's preview, 11 Nov 2026): Team scoring was "a green area with a V in it": no dates, nothing marked, and its boldest
 * figure was a change the card itself called "No clear change". Since lay-01 (owner, 15 Nov 2026) it is drawn on the player's
 * scoring line (SYS-04): dated axis, score labels, the team average dashed, the best day pinned.
 */
describe('Team scoring line', () => {
  const form = PREVIEW_HOME.phone.form!;

  it('dates its axis, labels the scores and names its best and toughest days', () => {
    const { container } = render(<TeamScoring form={form} phone={false} />);
    const ax = [...container.querySelectorAll('.ch-ph-chart__ax')].map((t) => t.textContent);
    expect(ax).toContain('Oct 13');
    expect(ax.some((t) => /^\d+$/.test(t ?? ''))).toBe(true);
    expect(container.querySelector('.ch-ph-chart__mean')).not.toBeNull();
    expect(screen.getByText(/Best day 73\.4 on Oct 13, toughest 74\.6 on Sep 2/)).toBeTruthy();
    expect(container.querySelector('.ch-ph-pinflag')?.textContent).toContain('Best day · 73.4');
  });

  it('never names a one-round day as the team’s best or toughest (HOME-P-13)', () => {
    const counts = form.lineCounts!.map((n, i) => (i === 0 ? 1 : n));
    expect(teamDays({ ...form, lineCounts: counts })?.worst).not.toBe(0);
    render(<TeamScoring form={{ ...form, lineCounts: counts }} phone={false} />);
    expect(screen.queryByText(/toughest 74\.6 on Sep 2/)).toBeNull();
  });

  it('a change under its standard error is words only; a clear one is signed and toned (HOME-P-09)', () => {
    const { container, rerender } = render(<TeamScoring form={form} phone />);
    const avg = () => container.querySelector('.ch-ph-figs > div')!;
    expect(avg().textContent).toContain('No clear change vs previous 10');
    expect(avg().querySelector('dd.is-gain, dd.is-loss')).toBeNull();
    rerender(<TeamScoring form={{ ...form, deltaSe: 0.3 }} phone />);
    expect(avg().querySelector('dd.is-gain')).not.toBeNull();
    expect(avg().textContent).toMatch(/−\d\.\d · Better than previous 10/);
  });

  it('draws no dates and marks no days without the days (an older fixture)', () => {
    const { container } = render(<TeamScoring form={{ ...form, lineDays: undefined }} phone={false} />);
    expect(container.querySelector('.ch-ph-pinflag')).toBeNull();
    expect(container.querySelector('.ch-ph-note')).toBeNull();
  });
});

import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

vi.mock('../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }), usePathname: () => '/golf/dashboard/coachhelm' }));
vi.mock('../lib/use-phone', () => ({ useChPhone: () => false, CH_PHONE_QUERY: '(max-width: 820px)' }));

import { PREVIEW_MONDAY_BRIEF, PREVIEW_MONDAY_BRIEF_EMPTY } from '../preview/fixtures-coachhelm-brief';
import { MondayBrief } from '../screens/coachhelm/views/MondayBrief';

describe('Monday brief (chs-28)', () => {
  it('CH-13971 CH-13972 the preview fixture runs the real computation: the pattern first, then one read per player at Likely or above', () => {
    const d = PREVIEW_MONDAY_BRIEF;
    expect(d.rows.map((r) => [r.who, r.title, r.tag])).toEqual([
      ['Team pattern', 'Wedges 50–125 yd · finishing short', '5 of 6 players with enough rounds'],
      ['Priya Shah', 'Three-putts', 'Seen repeatedly'],
      ['Maya Chen', 'Tee shots with driver: penalties', 'Observed'],
      ['Theo Marchetti', 'Bogey after a missed green', 'Likely'],
      ['Jonah Okafor', 'Downhill putts, 4–6 ft', 'Likely'],
    ]);
    expect(d.rows[1]!.strokes).toBe('0.8 strokes a round');
    expect(d.rows[3]!.behind).toBe('Its newest round is not in it yet');
    expect(d.counts).toBe('2 new · 1 cleared · 0 contradicted · 2 out of date');
    expect(d.cleared).toEqual(['Noah Brandt · 4–6 ft putts']);
    expect(d.team).toBe('9 players · 6 with enough rounds · 14 countable rounds last week');
  });

  it('CH-13970 CH-13977 draws the rows, each with one Open action, and the counts line last', () => {
    render(<MondayBrief load={{ status: 'ready', data: PREVIEW_MONDAY_BRIEF }} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Monday brief' })).toBeTruthy();
    const rows = screen.getAllByRole('listitem').filter((li) => li.className.includes('ch-hmb-row'));
    expect(rows).toHaveLength(5);
    for (const r of rows) expect(within(r).getAllByRole('link', { name: 'Open' })).toHaveLength(1);
    expect(within(rows[1]!).getByRole('link', { name: 'Open' }).getAttribute('href')).toBe('/golf/dashboard/coachhelm?player=pv-priya');
    expect(screen.getByText('2 new · 1 cleared · 0 contradicted · 2 out of date')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/\d%/);
  });

  it('CH-13973 empty: says nothing reached Likely and still prints the counts', () => {
    render(<MondayBrief load={{ status: 'ready', data: PREVIEW_MONDAY_BRIEF_EMPTY }} />);
    expect(screen.getByText('Nothing to raise this week')).toBeTruthy();
    expect(screen.getByText('0 new · 0 cleared · 0 contradicted · 0 out of date')).toBeTruthy();
  });

  it('CH-13975 CH-13974 failed and off are their own pages, never an empty brief', () => {
    const { unmount } = render(<MondayBrief load={{ status: 'failed' }} />);
    expect(screen.getByText('The Monday brief didn’t load')).toBeTruthy();
    unmount();
    render(<MondayBrief load={{ status: 'off', reason: null }} />);
    expect(screen.getByText('CoachHelm is off for your team')).toBeTruthy();
  });
});

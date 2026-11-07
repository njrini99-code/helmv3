import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), usePathname: () => '/golf/dashboard', useSearchParams: () => new URLSearchParams() }));
vi.mock('../../../lib/use-phone', () => ({ useChPhone: () => false }));

import { PREVIEW_HOME } from '../../../preview/fixtures';
import { CoachHome } from '../CoachHome';
import type { ChCoachHome } from '../../../data/home';

afterEach(cleanup);

/** Dashboard cuts, 2: one home per number. Desktop Home is the phone's design laid out wider. */
describe('coach Home desktop, the cuts', () => {
  const NOW = '2026-11-07T15:00:00.000Z';
  const data = (over: Partial<ChCoachHome['phone']> = {}) => ({ ...PREVIEW_HOME, phone: { ...PREVIEW_HOME.phone, ...over } }) as ChCoachHome;

  it('draws no leaderboard and no week list: those live on Roster, Stats and Calendar', () => {
    const { container } = render(<CoachHome crh data={data()} now={NOW} />);
    expect(container.querySelector('.ch-dh-rows--board')).toBeNull();
    expect(container.querySelector('.ch-dh-rows--agenda')).toBeNull();
    expect(container.querySelector('.ch-hm-week')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Leaderboard' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'This week' })).toBeNull();
  });

  it('draws the next event once: Up next holds it and Today lists the rest', () => {
    const next = PREVIEW_HOME.phone.next ?? PREVIEW_HOME.phone.today[0]!;
    const rest = { ...next, id: 'later', title: 'Film session' };
    const { container } = render(<CoachHome crh data={data({ next, today: [next, rest] })} now={NOW} />);
    const count = (container.textContent!.match(new RegExp(next.title, 'g')) ?? []).length;
    expect(count).toBe(1);
    expect(screen.getByText('Film session')).toBeTruthy();
  });

  it('leaves Today out when the next event is all of it', () => {
    const next = PREVIEW_HOME.phone.next ?? PREVIEW_HOME.phone.today[0]!;
    const { container } = render(<CoachHome crh data={data({ next, today: [next] })} now={NOW} />);
    expect(container.querySelector('.ch-hm-tl')).toBeNull();
  });

  it('with the flag off keeps the page it had', () => {
    const { container } = render(<CoachHome data={data()} now={NOW} />);
    expect(screen.getByRole('heading', { name: /leaderboard/i })).toBeTruthy();
    expect(container.querySelector('.ch-h-herocard')).toBeNull();
  });
});

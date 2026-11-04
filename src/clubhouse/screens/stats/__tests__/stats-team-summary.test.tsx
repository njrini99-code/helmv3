import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/haptics', () => ({ haptic: vi.fn(), hapticScrub: vi.fn() }));
vi.mock('../../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }), useSearchParams: () => new URLSearchParams(), usePathname: () => '/golf/dashboard/stats' }));
vi.mock('@/app/golf/actions/development', () => ({ createFocusArea: vi.fn() }));

import { formatSigned } from '../../../lib/format';
import { PREVIEW_TEAM_STATS as TEAM } from '../../../preview/fixtures-stats';
import { asDesktop, asPhone, browserBack, card, cards, detailShown, painted, resetAddress, showTeam } from './_shs-harness';

beforeEach(() => {
  asPhone();
  resetAddress();
});
afterEach(() => {
  cleanup();
  asDesktop();
});

/** Stats-home criteria 48 to 56, 86. */
describe('Team Stats, the summary', () => {
  it('has the drawn sections and three cards, no large title', async () => {
    showTeam(TEAM);
    await painted('tplayers');
    expect([...document.querySelectorAll('.ch-shs-sech')].map((h) => h.textContent)).toEqual(['Overview', 'Team game', 'Players']);
    expect(cards()).toEqual(['tscore', 'tgame', 'tplayers']);
    expect(document.querySelector('[data-ch-large-title]')).toBeNull();
  });

  it('the green card is the only feature card', async () => {
    showTeam(TEAM);
    await painted('tplayers');
    expect(document.querySelectorAll('.ch-shs-feature')).toHaveLength(1);
    expect(card('tscore')!.classList.contains('ch-shs-feature')).toBe(true);
  });

  it('the team strokes gained is the stored mean, never the sum of its legs', async () => {
    const legs = [1, 1, 1, 1];
    showTeam({ ...TEAM, legTotals: legs, team: { ...TEAM.team, sgMean: -0.5 } });
    const c = await painted('tgame');
    expect(c.querySelector('.ch-shs-bigv')!.textContent).toBe(formatSigned(-0.5));
    expect(c.querySelector('.ch-shs-bigv')!.textContent).not.toBe(formatSigned(4));
  });

  it('players: the top three by strokes gained, in order, with no link on the summary', async () => {
    showTeam(TEAM);
    const c = await painted('tplayers');
    const names = [...c.querySelectorAll('.ch-shs-prow .nm')].map((n) => n.textContent);
    expect(names).toHaveLength(3);
    const ranked = [...TEAM.grid].filter((g) => g.total != null).sort((a, b) => b.total! - a.total!).slice(0, 3).map((g) => g.name);
    expect(names).toEqual(ranked);
    expect(c.querySelectorAll('a, button')).toHaveLength(0);
  });
});

describe('Team Stats, the details', () => {
  it.each([
    ['tscore', 'Team scoring'],
    ['tgame', 'Team game'],
    ['tplayers', 'Players'],
  ])('%s opens and Back returns', async (go) => {
    showTeam(TEAM);
    fireEvent.click(await painted(go));
    await waitFor(() => expect(detailShown()).not.toBeNull());
    expect(card(go)!.closest('[inert]')).not.toBeNull();
    await browserBack();
    await waitFor(() => expect(card(go)!.closest('[inert]')).toBeNull());
  });

  it('back reads Stats', async () => {
    showTeam(TEAM);
    fireEvent.click(await painted('tgame'));
    await waitFor(() => expect(document.querySelector('[data-ch="stats-back"]')?.textContent).toMatch(/Stats/));
  });

  it('team game: a leg row pins, a second tap unpins, and nothing opens (criterion 74)', async () => {
    showTeam(TEAM);
    fireEvent.click(await painted('tgame'));
    await waitFor(() => expect(document.querySelector('.ch-shs-drow')).not.toBeNull());
    const row = document.querySelector<HTMLElement>('.ch-shs-drow')!;
    const hash = window.location.hash;
    expect(document.querySelector('.ch-shs-readout')!.textContent).toBe('Tap a leg to read it.');
    fireEvent.click(row);
    expect(row.getAttribute('aria-pressed')).toBe('true');
    expect(row.classList.contains('is-pinned')).toBe(true);
    expect(document.querySelector('.ch-shs-readout')!.textContent).toMatch(/a round\.$/);
    fireEvent.click(row);
    expect(row.getAttribute('aria-pressed')).toBe('false');
    expect(window.location.hash).toBe(hash);
  });

  it('team game draws a Total row at the stored mean (criterion 86)', async () => {
    showTeam(TEAM);
    fireEvent.click(await painted('tgame'));
    await waitFor(() => expect(document.querySelector('.ch-shs-drow.is-total')).not.toBeNull());
    expect(document.querySelector('.ch-shs-drow.is-total .val')!.textContent).toBe(formatSigned(TEAM.team.sgMean));
  });

  it('players: every player’s name reaches the coach', async () => {
    showTeam(TEAM);
    fireEvent.click(await painted('tplayers'));
    await waitFor(() => expect(screen.getAllByText(TEAM.grid[0]!.name).length).toBeGreaterThan(0));
    for (const g of TEAM.grid) expect(document.body.textContent).toContain(g.name);
  });

  it('the page’s only heading one is for the screen reader', async () => {
    showTeam(TEAM);
    await painted('tscore');
    expect(document.querySelector('h1.ch-sr-only')!.textContent).toBe('Team stats');
  });
});

import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/haptics', () => ({ haptic: vi.fn(), hapticScrub: vi.fn() }));
vi.mock('../../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }), useSearchParams: () => new URLSearchParams(), usePathname: () => '/golf/dashboard/stats' }));
vi.mock('@/app/golf/actions/development', () => ({ createFocusArea: vi.fn() }));

import { formatSigned } from '../../../lib/format';
import { PREVIEW_TEAM_STATS as TEAM, PREVIEW_TEAM_TOTALS } from '../../../preview/fixtures-stats';
import { render } from '@testing-library/react';
import { StatsTeam } from '../StatsTeam';
import { asDesktop, asPhone, browserBack, card, cards, detailShown, painted, resetAddress, showTeam, tree } from './_shs-harness';

beforeEach(() => {
  asPhone();
  resetAddress();
});
afterEach(() => {
  cleanup();
  asDesktop();
});

describe("production’s ?area= on Team Stats", () => {
  it.each([
    ['scoring', 'sd-team-score'],
    ['game', 'sd-team-game'],
    ['players', 'sd-team-players'],
  ])('?area=%s opens %s, and Back reaches the summary', async (area, hash) => {
    window.history.replaceState(null, '', `/golf/dashboard/stats?area=${area}`);
    render(tree(<StatsTeam data={TEAM} initialArea={area} />));
    await waitFor(() => expect(detailShown()).toBe(hash));
    await browserBack();
    await waitFor(() => expect(detailShown()).toBeNull());
    expect(window.location.search).toBe('');
  });
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
    expect(c.querySelectorAll('a, button:not(.ch-shs-sum__key)')).toHaveLength(0);
  });
});

/** Every round posted as a total: a scoring average and its line, and nothing that needs shots. */
describe('Team Stats, the summary on totals-only rounds', () => {
  it('strokes gained by leg says once what fills it, with no rows of dashes', async () => {
    showTeam(PREVIEW_TEAM_TOTALS);
    const c = await painted('tgame');
    expect(c.querySelector('.ch-shs-bigv')!.textContent).toBe('—');
    expect(c.querySelector('.ch-shs-mrows')).toBeNull();
    expect([...c.querySelectorAll('.ch-shs-sumfoot')].map((p) => p.textContent)).toEqual(['Fills in from rounds posted with shots. Rounds posted as totals still count toward scoring.']);
  });

  it('who gains and loses has no one to rank, and says what fills it', async () => {
    showTeam(PREVIEW_TEAM_TOTALS);
    const c = await painted('tplayers');
    expect(c.querySelectorAll('.ch-shs-prow')).toHaveLength(0);
    expect(c.querySelector('.ch-shs-sumfoot')!.textContent).toBe('Fills in from rounds posted with shots.');
  });

  it('a team with shots keeps its four legs and its foot, and no such line', async () => {
    showTeam(TEAM);
    const c = await painted('tgame');
    expect(c.querySelectorAll('.ch-shs-mrow')).toHaveLength(4);
    expect(c.textContent).not.toContain('Fills in from rounds posted with shots');
    expect((await painted('tplayers')).textContent).not.toContain('Fills in from rounds posted with shots');
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

/** Tabular numerals come from `.ch-num` (CONS-39): a figure in a card's foot, its reference line and its head caption take it. */
describe('Team Stats, figures outside the big values are tabular too', () => {
  it('the leg card’s foot figures and each card’s head caption', async () => {
    showTeam(TEAM);
    const game = await painted('tgame');
    const foot = [...game.querySelectorAll('.ch-shs-sumfoot b')];
    expect(foot.map((b) => b.textContent)).toEqual(['61%', '30.4', '52%']);
    expect(foot.every((b) => b.classList.contains('ch-num'))).toBe(true);
    const metas = [...document.querySelectorAll('.ch-shs-ah__meta')];
    expect(metas.length).toBeGreaterThanOrEqual(3);
    expect(metas.every((m) => m.classList.contains('ch-num'))).toBe(true);
  });
});

describe('Team Stats, The round’s note', () => {
  it('keeps each separator with the words before it, so a wrapped line never starts with the dot', async () => {
    asDesktop();
    showTeam(TEAM);
    await waitFor(() => expect([...document.querySelectorAll('.ch-shs-anote')].some((p) => p.textContent!.includes('countable rounds only'))).toBe(true));
    const note = [...document.querySelectorAll('.ch-shs-anote')].find((p) => p.textContent!.includes('countable rounds only'))!;
    expect(note.textContent).toContain('Varsity · 7 active players · countable rounds only.');
    expect(note.textContent).not.toMatch(/ · /);
  });
});

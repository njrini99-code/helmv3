import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hapticSpy = vi.hoisted(() => vi.fn());
vi.mock('../../../lib/haptics', () => ({ haptic: hapticSpy, hapticScrub: vi.fn() }));
vi.mock('../../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }), useSearchParams: () => new URLSearchParams(), usePathname: () => '/golf/dashboard/stats' }));
vi.mock('@/app/golf/actions/development', () => ({ createFocusArea: vi.fn(), acceptFocusArea: vi.fn(), declineFocusArea: vi.fn() }));

import { PREVIEW_PLAYER_SHS, PREVIEW_PLAYER_SHS_SELF } from '../../../preview/fixtures-stats-redesign';
import { SummaryCard } from '../SummaryCard';
import { StatsPlayer } from '../StatsPlayer';
import { asDesktop, asPhone, browserBack, card, detailShown, painted, resetAddress, showPlayer, tree } from './_shs-harness';

beforeEach(() => {
  hapticSpy.mockClear();
  asPhone();
  resetAddress();
});
afterEach(() => {
  cleanup();
  asDesktop();
});

/** Stats-home criterion 67 and the chart half of 68, at the card itself. */
describe('SummaryCard', () => {
  const one = (feature = false) => {
    const onOpen = vi.fn();
    render(
      <SummaryCard go="scoring" onOpen={onOpen} title="Scoring average" ariaLabel="Scoring average 73. Open details" feature={feature}>
        <div data-testid="chart" data-ch-no-open="">
          <span data-testid="in-chart" />
        </div>
        <button type="button" data-testid="inner">
          x
        </button>
      </SummaryCard>,
    );
    return { onOpen, el: screen.getByRole('button', { name: /Scoring average 73/ }) };
  };

  it('a tap opens, with the select haptic', () => {
    const { onOpen, el } = one();
    fireEvent.click(el);
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(hapticSpy).toHaveBeenCalledWith('select');
  });

  it('its keyboard and VoiceOver path is one real button, and nothing inside is nested in it (STATS-8)', () => {
    const { el } = one();
    expect(el.tagName).toBe('BUTTON');
    expect(el.childElementCount).toBe(0);
    expect(el.closest('section')?.getAttribute('role')).toBeNull();
    expect(el.closest('section')?.hasAttribute('tabindex')).toBe(false);
  });

  it('a key pressed on something inside the card does not open the card', () => {
    const { onOpen } = one();
    fireEvent.keyDown(screen.getByTestId('inner'), { key: 'Enter' });
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('a tap or drag ending on the chart never opens it', () => {
    const { onOpen } = one();
    fireEvent.click(screen.getByTestId('chart'));
    fireEvent.click(screen.getByTestId('in-chart'));
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('the feature chevron is a real button and opens exactly once', () => {
    const { onOpen } = one(true);
    const chev = screen.getByRole('button', { name: 'Open scoring average details' });
    fireEvent.click(chev);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('a plain card draws no chevron button', () => {
    one();
    expect(document.querySelector('.ch-shs-dlink')).toBeNull();
  });

  it('a press deepens the surface and never scales the card (owner: presses never scale; CH-1606)', () => {
    one();
    const section = document.querySelector<HTMLElement>('[data-ch="stats-card"]')!;
    expect(section.hasAttribute('data-ch-press-scale')).toBe(false);
    // The press controller marks the pressed card from this, and the wash is drawn from `data-ch-pressed`.
    expect(section.hasAttribute('data-ch-pressable')).toBe(true);
  });
});

describe("production's ?area= deep links on the phone", () => {
  const arrive = (area: string) => {
    window.history.replaceState(null, '', `/golf/dashboard/stats?area=${area}`);
    return render(tree(<StatsPlayer data={PREVIEW_PLAYER_SHS_SELF} coachId={null} initialArea={area} />));
  };

  it.each([
    ['putting', 'gm-putting'],
    ['driving', 'gm-tee'],
    ['short-game', 'gm-short'],
    ['standing', 'sd-sg'],
    ['rounds', 'sd-rounds'],
  ])('?area=%s opens %s in place, and Back reaches the summary without the area', async (area, hash) => {
    arrive(area);
    await waitFor(() => expect(detailShown()).toBe(hash));
    await browserBack();
    await waitFor(() => expect(detailShown()).toBeNull());
    expect(window.location.search).toBe('');
  });

  it('an area production has and this screen does not (home) opens the summary', async () => {
    arrive('home');
    await painted('scoring');
    expect(detailShown()).toBeNull();
  });
});

describe('each summary card opens its detail and Back returns', () => {
  it.each([
    ['scoring', 'gm-scoring'],
    ['sg', 'sd-sg'],
    ['tee', 'gm-tee'],
    ['approach', 'gm-approach'],
    ['short', 'gm-short'],
    ['putting', 'gm-putting'],
    ['rounds', 'sd-rounds'],
    ['goals', 'sd-goals'],
  ])('%s', async (go, hash) => {
    showPlayer(PREVIEW_PLAYER_SHS_SELF);
    const el = await painted(go);
    fireEvent.click(el);
    await waitFor(() => expect(detailShown()).toBe(hash));
    expect(window.location.hash).toBe(`#${hash}`);
    // The summary behind is out of reach while a detail shows.
    expect(card(go)!.closest('[inert]')).not.toBeNull();
    await browserBack();
    await waitFor(() => expect(window.location.hash).toBe(''));
    await waitFor(() => expect(card(go)!.closest('[inert]')).toBeNull());
  });

  it('dragging on the scoring chart does not open the detail', async () => {
    showPlayer(PREVIEW_PLAYER_SHS_SELF);
    await painted('scoring');
    const chart = document.querySelector<HTMLElement>('[data-ch="stats-hero-chart"]')!;
    fireEvent.click(chart);
    expect(detailShown()).toBeNull();
    expect(window.location.hash).toBe('');
  });

  it('the card’s own key opens it, as Enter on it does', async () => {
    showPlayer(PREVIEW_PLAYER_SHS_SELF);
    fireEvent.click((await painted('sg')).querySelector('.ch-shs-sum__key')!);
    await waitFor(() => expect(detailShown()).toBe('sd-sg'));
  });

  it('the coach reads "Player stats" on the back key, the player "My stats" (criteria 28, 47)', async () => {
    showPlayer(PREVIEW_PLAYER_SHS_SELF);
    fireEvent.click(await painted('sg'));
    await waitFor(() => expect(document.querySelector('[data-ch="stats-back"]')?.textContent).toMatch(/My stats/));
    cleanup();
    resetAddress();
    showPlayer(PREVIEW_PLAYER_SHS);
    fireEvent.click(await painted('sg'));
    await waitFor(() => expect(document.querySelector('[data-ch="stats-back"]')?.textContent).toMatch(/Player stats/));
  });
});

/** Criterion 69: what each At a glance tile opens. */
describe('At a glance', () => {
  it.each([
    ['Greens', 'gm-approach'],
    ['Fairways', 'gm-tee'],
    ['Scrambling', 'gm-short'],
    ['Putts', 'gm-putting'],
    ['Birdies', 'gm-scoring'],
    ['Bogeys', 'gm-scoring'],
  ])('%s opens %s', async (label, hash) => {
    showPlayer(PREVIEW_PLAYER_SHS_SELF);
    await painted('scoring');
    const tile = [...document.querySelectorAll<HTMLElement>('[data-ch="stats-glance"]')].find((t) => t.querySelector('.t')?.textContent === label)!;
    fireEvent.click(tile);
    await waitFor(() => expect(detailShown()).toBe(hash));
  });

  it('draws six tiles in the drawn order (criterion 15)', async () => {
    showPlayer(PREVIEW_PLAYER_SHS_SELF);
    await painted('scoring');
    expect([...document.querySelectorAll('[data-ch="stats-glance"] .t')].map((t) => t.textContent)).toEqual(['Greens', 'Fairways', 'Scrambling', 'Putts', 'Birdies', 'Bogeys']);
  });
});

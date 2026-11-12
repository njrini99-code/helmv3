import { cleanup, render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { tourFixture } from '../preview/fixtures-tournaments';
import { Compare } from '../screens/tournaments/Compare';
import { EventDesk } from '../screens/tournaments/EventDesk';
import { EventForm } from '../screens/tournaments/EventForm';
import { History } from '../screens/tournaments/History';
import { LineupBuilder } from '../screens/tournaments/LineupBuilder';
import { LinkInbox } from '../screens/tournaments/LinkInbox';
import { LiveRound } from '../screens/tournaments/LiveRound';
import { PlayerEvent } from '../screens/tournaments/PlayerEvent';
import { Review } from '../screens/tournaments/Review';
import { TournamentsHome } from '../screens/tournaments/TournamentsHome';
import type { ChTourLoad } from '../screens/tournaments/types';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }) }));

afterEach(cleanup);

/**
 * Every Tournaments view keeps its final props contract (README.md) and draws the page states: loading CH-16401 and the
 * page's one read failed CH-16201. All ten views are built; each one's own file (tournaments-<view>.test.tsx) tests its
 * content. The placeholder and its "isn't built yet" state (CH-16301) are gone, and this file keeps them gone.
 */
const f = tourFixture('ready');
const VIEWS: Array<[string, (load: ChTourLoad) => ReactElement]> = [
  ['home', (load) => <TournamentsHome data={f.home} load={load} />],
  ['desk', (load) => <EventDesk data={f.desks.e33!} search={{ tab: 'overview', round: 'all', view: 'team', holes: 'to-par' }} load={load} />],
  ['review', (load) => <Review data={f.review} load={load} />],
  ['history', (load) => <History data={f.history} search={{ mode: 'actual', adjust: 'raw' }} load={load} />],
  ['links', (load) => <LinkInbox data={f.links} load={load} />],
  ['compare', (load) => <Compare data={f.compare} search={{ a: null, b: null, m: null, bench: null, split: null }} load={load} />],
  ['lineup', (load) => <LineupBuilder data={f.lineup} load={load} />],
  ['form', (load) => <EventForm data={f.form.create} load={load} />],
  ['live', (load) => <LiveRound data={f.live} load={load} />],
  ['player', (load) => <PlayerEvent data={f.player.events.e33!} load={load} />],
];

describe('Tournaments views', () => {
  it.each(VIEWS)('%s draws its loading (CH-16401) and failed (CH-16201) states and is not a placeholder', (view, draw) => {
    const loading = render(draw('loading')).container;
    const main = loading.querySelector(`[data-ch-tour-view="${view}"]`);
    expect(main).toHaveAttribute('data-ch-code', 'CH-16401');
    expect(main).toHaveAttribute('aria-busy', 'true');
    cleanup();

    const failed = render(draw('failed')).container;
    const alert = failed.querySelector('[data-ch-code="CH-16201"]');
    expect(alert).toHaveAttribute('role', 'alert');
    expect(alert?.textContent).toContain('Tournaments didn’t load');
    cleanup();

    const ready = render(draw('ready')).container;
    expect(ready.querySelector(`[data-ch-tour-view="${view}"] h1`)).not.toBeNull();
    expect(ready.querySelector('[data-ch-code="CH-16301"]')).toBeNull();
  });
});

describe('Tournaments views, the words', () => {
  it('writes no exclamation mark and no straight apostrophe in what a view says', () => {
    for (const [, draw] of VIEWS) {
      for (const load of ['ready', 'failed'] as const) {
        const text = render(draw(load)).container.textContent ?? '';
        expect(text).not.toMatch(/[!']/);
        cleanup();
      }
    }
  });
});

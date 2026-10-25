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
import type { ChTourDeskTab } from '../screens/tournaments/types';
import { parseTourPreviewState, tourFixture } from './fixtures-tournaments';

/**
 * The Tournaments preview screens (P016; /clubhouse-preview/tournament*), each view drawn from `tourFixture` for one
 * `?state=` (loading, empty, failed, partial, thin, provisional, live). Base-owned (screens/tournaments/README.md):
 * a lane changes what its own screen passes here, never another's.
 *
 *   tournaments           season home
 *   tournament-desk       &event=e33 (default) | e32 | e34 | …, &tab=overview | live | counted | holes | compare | review
 *   tournament-review     Oakmont's review        tournament-history   season history
 *   tournament-links      the round link inbox    tournament-compare   the comparison workspace
 *   tournament-lineup     Pinehurst's lineup      tournament-form      &view=edit for Edit event, else New event
 *   tournament-live       Pinehurst round 1, on the simulated feed
 *   tournament-player     Jonah: the list, or &event=e33 | e34 | … for one event
 */
export const TOUR_PREVIEW_PATHS: Record<string, string> = {
  tournaments: '/golf/dashboard/tournaments',
  'tournament-desk': '/golf/dashboard/tournaments',
  'tournament-review': '/golf/dashboard/tournaments',
  'tournament-history': '/golf/dashboard/tournaments/history',
  'tournament-links': '/golf/dashboard/tournaments/links',
  'tournament-compare': '/golf/dashboard/tournaments/compare',
  'tournament-lineup': '/golf/dashboard/tournaments',
  'tournament-form': '/golf/dashboard/tournaments/new',
  'tournament-live': '/golf/dashboard/tournaments',
  'tournament-player': '/golf/dashboard/tournaments',
};

const DESK_TABS: ChTourDeskTab[] = ['overview', 'live', 'counted', 'holes', 'compare', 'review'];

export function PreviewTournaments({ screen, state, event, tab, view }: { screen: string; state?: string; event?: string; tab?: string; view?: string }) {
  const f = tourFixture(parseTourPreviewState(state));
  const load = f.load;
  switch (screen) {
    case 'tournaments':
      return <TournamentsHome data={f.home} load={load} />;
    case 'tournament-desk': {
      const data = f.desks[event ?? 'e33'] ?? f.desks.e33 ?? Object.values(f.desks)[0]!;
      const t = DESK_TABS.find((x) => x === tab) ?? 'overview';
      return <EventDesk data={data} search={{ tab: t, round: 'all', view: 'team', holes: 'to-par' }} load={load} />;
    }
    case 'tournament-review':
      return <Review data={f.review} load={load} />;
    case 'tournament-history':
      return <History data={f.history} search={{ mode: 'actual', adjust: 'raw' }} load={load} />;
    case 'tournament-links':
      return <LinkInbox data={f.links} load={load} />;
    case 'tournament-compare':
      return <Compare data={f.compare} search={{ a: null, b: null, m: null, bench: null, split: null }} load={load} />;
    case 'tournament-lineup':
      return <LineupBuilder data={f.lineup} load={load} />;
    case 'tournament-form':
      return <EventForm data={view === 'edit' ? f.form.edit : f.form.create} load={load} />;
    case 'tournament-live':
      return <LiveRound data={f.live} load={load} simulate />;
    case 'tournament-player':
      return <PlayerEvent data={(event && f.player.events[event]) || f.player.list} load={load} />;
    default:
      return null;
  }
}

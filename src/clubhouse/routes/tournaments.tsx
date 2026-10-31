import 'server-only';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { isUuid } from '@/lib/utils/uuid';
import {
  loadPlayerTournaments,
  loadTournamentCompare,
  loadTournamentDesk,
  loadTournamentForm,
  loadTournamentHistory,
  loadTournamentLineup,
  loadTournamentLinks,
  loadTournamentLive,
  loadTournamentsHome,
  tourContext,
  type TourLoad,
} from '../data/tournaments';
import { Compare } from '../screens/tournaments/Compare';
import { EventDesk } from '../screens/tournaments/EventDesk';
import { EventForm } from '../screens/tournaments/EventForm';
import { History } from '../screens/tournaments/History';
import { LineupBuilder } from '../screens/tournaments/LineupBuilder';
import { LinkInbox } from '../screens/tournaments/LinkInbox';
import { LiveRound } from '../screens/tournaments/LiveRound';
import { PlayerEvent } from '../screens/tournaments/PlayerEvent';
import { TournamentsHome } from '../screens/tournaments/TournamentsHome';
import { TourNotice } from '../screens/tournaments/TourNotice';
import { resolveClubhouseTeam } from './team';
import { compareSearchOf, deskSearchOf, historySearchOf, one, type Search } from './tournaments-search';

export type ChTourRouteView = 'home' | 'new' | 'compare' | 'history' | 'links' | 'desk' | 'edit' | 'lineup' | 'live';

const COACH_ONLY = new Set<ChTourRouteView>(['new', 'compare', 'history', 'links', 'edit', 'lineup', 'live']);
/** A loader's non-ready answers, drawn the same way on every route. */
function notReady(load: Exclude<TourLoad<unknown>, { kind: 'ready' }>, coach: boolean, title: string) {
  if (load.kind === 'not_set_up') return <TourNotice kind="not_set_up" coach={coach} />;
  if (load.kind === 'missing') return <TourNotice kind="not_found" coach={coach} />;
  return <TourNotice kind="failed" coach={coach} title={title} />;
}

/**
 * Tournaments in Clubhouse (P016), every address rendered in place (D-23, never a redirect). The page has already
 * checked golf_tournaments_v1 and the Clubhouse gate (`isTournamentsFor`):
 *   /tournaments                 coach: the season home; player: their list
 *   /tournaments/[id]            coach: the event desk (?tab=…); player: their event
 *   /tournaments/new, compare, history, links, [id]/edit, [id]/lineup, [id]/live   coach only
 */
export async function ClubhouseTournamentsRoute({ view, id, search = {} }: { view: ChTourRouteView; id?: string; search?: Search }) {
  const session = await getGolfSessionProfile();
  if (!session) return null;
  const team = await resolveClubhouseTeam(session);
  if (!team) return <TourNotice kind="no_team" coach={!!session.coach} />;
  const coach = team.role === 'coach';
  if (COACH_ONLY.has(view) && !coach) return <TourNotice kind="coach_only" coach={false} />;
  if ((view === 'desk' || view === 'edit' || view === 'lineup' || view === 'live') && (!id || !isUuid(id))) return <TourNotice kind="not_found" coach={coach} />;
  const ctx = await tourContext(team);

  if (!coach) {
    const load = await loadPlayerTournaments(ctx, view === 'desk' ? id! : null);
    return load.kind === 'ready' ? <PlayerEvent data={load.data} /> : notReady(load, false, 'Tournaments');
  }

  switch (view) {
    case 'home': {
      const load = await loadTournamentsHome(ctx);
      return load.kind === 'ready' ? <TournamentsHome data={load.data} live /> : notReady(load, true, 'Tournaments');
    }
    case 'desk': {
      const load = await loadTournamentDesk(ctx, id!);
      return load.kind === 'ready' ? <EventDesk data={load.data} search={deskSearchOf(search)} /> : notReady(load, true, 'Event');
    }
    case 'history': {
      const load = await loadTournamentHistory(ctx);
      return load.kind === 'ready' ? <History data={load.data} search={historySearchOf(search)} /> : notReady(load, true, 'History');
    }
    case 'compare': {
      const event = one(search.event);
      const load = await loadTournamentCompare(ctx, event && isUuid(event) ? event : null);
      return load.kind === 'ready' ? <Compare data={load.data} search={compareSearchOf(search)} /> : notReady(load, true, 'Compare');
    }
    case 'links': {
      const load = await loadTournamentLinks(ctx);
      return load.kind === 'ready' ? <LinkInbox data={load.data} /> : notReady(load, true, 'Link rounds');
    }
    case 'new':
    case 'edit': {
      const from = one(search.from);
      const load = await loadTournamentForm(ctx, view === 'edit' ? id! : null, from && isUuid(from) ? from : null);
      return load.kind === 'ready' ? <EventForm data={load.data} /> : notReady(load, true, view === 'new' ? 'New event' : 'Edit event');
    }
    case 'lineup': {
      const load = await loadTournamentLineup(ctx, id!);
      return load.kind === 'ready' ? <LineupBuilder data={load.data} /> : notReady(load, true, 'Lineup');
    }
    case 'live': {
      const load = await loadTournamentLive(ctx, id!);
      return load.kind === 'ready' ? <LiveRound data={load.data} /> : notReady(load, true, 'Live round');
    }
  }
}

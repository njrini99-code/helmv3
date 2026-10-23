import 'server-only';
import { Suspense, type ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { Users } from 'lucide-react';
import { pickGolfDashboardRole } from '@/lib/auth/golf-dashboard-role';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { isTrackRecordEnabled } from '@/lib/coachhelm/v3/track-record/flag';
import { isMondayBriefEnabled } from '@/lib/coachhelm/v3/monday-brief/flag';
import { emptyCoachHelm, loadCoachCoachHelm, loadCoachHelmGate, loadPlayerCoachHelm, loadPlayerHelmGate } from '../data/coachhelm';
import { loadAskCoachHelm } from '../data/coachhelm-chat';
import { loadCoachPlayerDeepDive, loadCoachPlayerGame, loadCoachPlayerScope, loadCoachPlayerStanding, type ChCoachPlayerScope } from '../data/coachhelm-player';
import { loadPlayerDeepDive } from '../data/coachhelm-dive';
import { loadPlayerGame } from '../data/coachhelm-profile';
import { loadPlayerStanding } from '../data/coachhelm-standing';
import { loadCoachTrackRecord } from '../data/coachhelm-track-record';
import { loadCoachMondayBrief } from '../data/coachhelm-monday-brief';
import { loadCoachBrief } from '../data/coachhelm-coach-brief';
import { COACH_BRIEF_HREF, isBriefSection, type ChBriefSection } from '../data/coachhelm-coach-brief-shape';
import { COACH_TRACK_RECORD_HREF } from '../data/coachhelm-track-record-shape';
import { landsOnGame, PLAYER_HELM_DEVELOPMENT_HREF, playerHelmDrill, type ChViewLoad, type ChViewVoice, type CoachPlayerView as CoachPlayerViewName, type PlayerHelmView } from '../data/coachhelm-views-shape';
import { Ask } from '../screens/coachhelm/chat/Ask';
import { AskSkeleton } from '../screens/coachhelm/chat/AskSkeleton';
import { CoachBoard } from '../screens/coachhelm/CoachBoard';
import { CoachHelmSkeleton } from '../screens/coachhelm/CoachHelmSkeleton';
import { PlayerBoard } from '../screens/coachhelm/PlayerBoard';
import { CoachPlayerFailed, CoachPlayerNotOnTeam } from '../screens/coachhelm/views/CoachPlayerStates';
import { DeepDive } from '../screens/coachhelm/views/DeepDive';
import { DiveSkeleton, StandingSkeleton } from '../screens/coachhelm/views/Skeletons';
import { Standing } from '../screens/coachhelm/views/Standing';
import { TrackRecord } from '../screens/coachhelm/views/TrackRecord';
import { MondayBrief } from '../screens/coachhelm/views/MondayBrief';
import { CoachBrief } from '../screens/coachhelm/views/CoachBrief';
import { EmptyState } from '../ui/States';
import { resolveClubhouseTeam } from './team';
import '../styles/coachhelm.css';
import '../styles/coachhelm-ask.css';
import '../styles/coachhelm-views.css';
import '../styles/coachhelm-profile.css'; // Standing's "How you play" (the measures the Game profile drew)
import '../styles/coachhelm-standing.css';
import '../styles/coachhelm-dive.css';
import '../styles/coachhelm-track.css';
import '../styles/coachhelm-brief.css';

/**
 * /golf/dashboard/coachhelm in Clubhouse, for coaches and players (the Fairway
 * page is the player's only). The role comes from the session. A coach reads
 * their team's players, whichever other teams they staff; a player reads only
 * their own insights, with or without a team, and is never handed a coach control.
 *
 * Every view of this page (the coach's Board and Ask, the player's Board, Standing and Deep dive) is one async
 * component inside ONE Suspense, in the same place and not keyed by view (perf, 2026-10-01). A switch between views is a
 * transition, so React keeps the view on screen, dimmed by the tabs' own pending state (`useViewSwitch`), until the next view is
 * ready, and swaps once: no blank and no skeleton flash. The boundary's fallback is the skeleton of the view the address names,
 * so a hard load (the one time there is nothing to keep) draws the right shape at once, which `coachhelm/loading.tsx` cannot do
 * (it cannot see `?view=`). The reads that need the CoachHelm gate run inside it, after the page has been handed back, so the
 * shell never waits on them. Nothing here is cached or prefetched beyond the request: the delivery actions record every insight
 * they return as shown, so a page that is read twice, or ahead of the tap, would count insights nobody saw.
 */

/** The coach's Board or Ask. The Board's loader checks the CoachHelm gate itself; Ask's is checked here, before its read. */
async function CoachHelmView({ coachId, teamId, ask, conversationId, initialPlayer }: { coachId: string; teamId: string; ask: boolean; conversationId?: string; initialPlayer?: string }) {
  if (!ask) return <CoachBoard data={await loadCoachCoachHelm({ coachId, teamId })} initialPlayer={initialPlayer} trackRecordHref={isTrackRecordEnabled() ? COACH_TRACK_RECORD_HREF : undefined} briefHref={isMondayBriefEnabled() ? COACH_BRIEF_HREF : undefined} />;
  // Ask is CoachHelm's, so it is off when CoachHelm is off for this coach, their team or GolfHelm, as the board is: the
  // address that led here is answered with the board's own "CoachHelm is off" page, and a lookup that failed with Ask's own
  // "did not load" notice, never with a chat that runs against a switch that is off.
  const gate = await loadCoachHelmGate(coachId);
  if (gate.status === 'off') return <CoachBoard data={emptyCoachHelm(gate.off)} />;
  if (gate.status === 'failed') return <Ask load={{ status: 'failed' }} />;
  return <Ask load={await loadAskCoachHelm({ conversationId })} />;
}

/** The coach's Track record (`?view=track-record`, flag `coachhelm_track_record_v1`; the route checks the flag). Its loader checks the CoachHelm gate. */
async function CoachTrackRecordView({ coachId, teamId }: { coachId: string; teamId: string }) {
  return <TrackRecord load={await loadCoachTrackRecord({ coachId, teamId })} />;
}

/** The coach's Monday brief (`?view=monday-brief`, flag `coachhelm_monday_brief_v1`; the route checks the flag). Its loader checks the CoachHelm gate. */
async function CoachMondayBriefView({ coachId, teamId }: { coachId: string; teamId: string }) {
  return <MondayBrief load={await loadCoachMondayBrief({ coachId, teamId })} />;
}

/** The coach's Brief (`?view=brief`, behind `coachhelm_monday_brief_v1`; the route checks the flag): the team view `/intelligence` lands on. Its loader checks the CoachHelm gate. */
async function CoachBriefView({ coachId, teamId, section }: { coachId: string; teamId: string; section: ChBriefSection | null }) {
  return <CoachBrief load={await loadCoachBrief({ coachId, teamId })} section={section} />;
}

/**
 * The player's Board, Standing or Deep dive (`?view=`). Read only for the signed-in player (`playerId` is the session's, never the
 * address's) and only once CoachHelm is on for them, as the board is: off is the board's own "CoachHelm is off" page, and a lookup
 * that failed is the view's own "did not load", never a view that reads against a switch that is off. The Board's loader checks the
 * gate itself; a view's is checked here, before its read. Standing reads "How you play" (the genome, once the Game profile) beside its
 * rows; `at` opens it there (`?view=profile`, CH-13913).
 */
async function PlayerHelmView({ playerId, drill, insight, at }: { playerId: string; drill: Exclude<PlayerHelmView, 'board'> | null; insight?: string; at?: 'game' }) {
  if (!drill) return <PlayerBoard data={await loadPlayerCoachHelm({ playerId })} />;
  const gate = await loadPlayerHelmGate(playerId);
  const closed: ChViewLoad<never> | null = gate.status === 'on' ? null : gate.status === 'off' ? { status: 'off', reason: gate.reason } : { status: 'failed' };
  if (drill === 'standing') {
    if (closed) return <Standing load={closed} />;
    const [standing, game] = await Promise.all([loadPlayerStanding({ playerId }), loadPlayerGame({ playerId })]);
    return <Standing load={standing} game={game} at={at} />;
  }
  return <DeepDive load={closed ?? (await loadPlayerDeepDive({ playerId }))} initialId={insight ?? null} />;
}

/**
 * A coach's Standing or Deep dive of one player (`?view=…&player=<golf_players.id>`, spec A; `?view=profile` is Standing at "How
 * {first} plays", CH-13913). The address's id is only input: `loadCoachPlayerScope` checks it against this coach's own team (the one
 * the shell resolved) before anything about the player is read, and the loaders take the scope it makes, never the id. An id that is not on this team, or is not an id, is one
 * "isn't on your team" page (CH-13311), whatever it names; a check that did not load is the page's own "didn't load" (CH-13209),
 * never that page. CoachHelm off for the coach is the board's own page (CH-13305); off for the player's team is the view's own off
 * page, said by name (CH-13313). Once the player is known the view's read runs in a boundary of its own whose skeleton says whose page
 * it is; it stays in one place and is not keyed by view, so a switch between the two keeps the view on screen as the outer one does.
 */
async function CoachPlayerPage({ coachId, teamId, playerId, drill, insight, at }: { coachId: string; teamId: string; playerId: string; drill: CoachPlayerViewName; insight?: string; at?: 'game' }) {
  const checked = await loadCoachPlayerScope({ coachId, teamId, playerId });
  if (checked.status === 'not-member') return <CoachPlayerNotOnTeam />;
  if (checked.status === 'failed') return <CoachPlayerFailed />;
  if (checked.status === 'coach-off') return <CoachBoard data={emptyCoachHelm(checked.off)} />;
  const head = checked.status === 'ok' ? checked.scope.head : checked.head;
  const voice: ChViewVoice = { role: 'coach', ...head };
  if (checked.status === 'player-off') {
    const off = { status: 'off', reason: checked.reason } as const;
    if (drill === 'standing') return <Standing load={off} voice={voice} />;
    return <DeepDive load={off} voice={voice} initialId={null} />;
  }
  const { scope } = checked;
  return (
    <Suspense fallback={coachPlayerSkeleton(drill, head.first)}>
      <CoachPlayerRead scope={scope} drill={drill} voice={voice} insight={insight} at={at} />
    </Suspense>
  );
}

/** The view's own read, for a scope the page has checked. `?insight=` means something only on the Deep dive, and an id not on it is ignored there. */
async function CoachPlayerRead({ scope, drill, voice, insight, at }: { scope: ChCoachPlayerScope; drill: CoachPlayerViewName; voice: ChViewVoice; insight?: string; at?: 'game' }) {
  if (drill === 'standing') {
    const [standing, game] = await Promise.all([loadCoachPlayerStanding({ scope }), loadCoachPlayerGame({ scope })]);
    return <Standing load={standing} game={game} voice={voice} at={at} />;
  }
  return <DeepDive load={await loadCoachPlayerDeepDive({ scope })} voice={voice} initialId={insight ?? null} />;
}

/** A coach's view skeleton, with the player's header; `first` once the page knows who the player is. */
function coachPlayerSkeleton(view: CoachPlayerViewName, first: string | null, chained = false): ReactNode {
  const coach = { first };
  if (view === 'standing') return <StandingSkeleton chained={chained} coach={coach} />;
  return <DiveSkeleton chained={chained} coach={coach} />;
}

/**
 * The skeleton of the view an address names (each in its final shape and height, so nothing jumps when the read lands). It is
 * `chained`: it follows the route's `loading.tsx` skeleton in the same place, so it does not fade in over it a second time.
 */
function viewSkeleton(view: PlayerHelmView): ReactNode {
  if (view === 'standing') return <StandingSkeleton chained />;
  if (view === 'deep-dive') return <DiveSkeleton chained />;
  return <CoachHelmSkeleton view="player" chained />;
}

/**
 * `?player=<golf_players.id>` opens a coach's board on that player; an id not on the board is ignored. `?view=deep-dive|standing`
 * with `?player=` is a coach's view of that player (spec A; Roster's View insights lands on the Deep dive), and the player's own view
 * for a player, whose `?player=` means nothing. `?view=profile` is Game profile's old address: Standing, opened at "How you play"
 * (CH-13913), for either. `?view=ask` (with `?c=`) is the coach's Ask sub-tab. `?view=brief` (with `&section=`) is the coach's Brief.
 */
export async function ClubhouseCoachHelmRoute({ view, player, c, insight, section }: { view?: string; player?: string; c?: string; insight?: string; section?: string } = {}) {
  if (view === 'development') redirect(PLAYER_HELM_DEVELOPMENT_HREF);
  const session = await getGolfSessionProfile();
  if (!session) return null;
  // The view follows the dashboard role (the one resolveClubhouseTeam and the layout use), not "has a coach row": a user
  // whose onboarded profile is the player one, with an unfinished coach profile beside it, is drawn as a player and gets
  // their own CoachHelm, never the coach's no-team page (wiring audit, 2026-10-17; routes/roster.tsx has the same rule).
  if (pickGolfDashboardRole(session) === 'coach' && session.coach) {
    const team = await resolveClubhouseTeam(session);
    if (!team || team.role !== 'coach') {
      return (
        <main className="ch-hl">
          <EmptyState
            size="page"
            code="CH-13308"
            icon={Users}
            title="You aren’t on a team yet"
            body="Once your team is set up, CoachHelm reads the rounds your players post and shows their signals here."
          />
        </main>
      );
    }
    // The Track record is the coach's alone, and only with its flag on; with it off the address is the board.
    if (view === 'track-record' && isTrackRecordEnabled()) {
      return (
        <Suspense fallback={<CoachHelmSkeleton view="coach" chained />}>
          <CoachTrackRecordView coachId={team.coachId} teamId={team.teamId} />
        </Suspense>
      );
    }
    // A coach's view of one player: the address names the player, and the page checks it against this team before any read.
    const coachDrill = playerHelmDrill(view);
    if (coachDrill && typeof player === 'string') {
      return (
        <Suspense fallback={coachPlayerSkeleton(coachDrill, null, true)}>
          <CoachPlayerPage coachId={team.coachId} teamId={team.teamId} playerId={player} drill={coachDrill} insight={coachDrill === 'deep-dive' && typeof insight === 'string' ? insight : undefined} at={landsOnGame(view) ? 'game' : undefined} />
        </Suspense>
      );
    }
    // The Monday brief is the coach's alone, and only with its flag on; with it off the address is the board.
    if (view === 'monday-brief' && isMondayBriefEnabled()) {
      return (
        <Suspense fallback={<CoachHelmSkeleton view="coach" chained />}>
          <CoachMondayBriefView coachId={team.coachId} teamId={team.teamId} />
        </Suspense>
      );
    }
    // The Brief (the team view behind /intelligence) is the coach's alone and grows the Monday brief, so it shares that flag; with
    // it off the address is the board. `?section=` names the part an old /intelligence link was for.
    if (view === 'brief' && isMondayBriefEnabled()) {
      return (
        <Suspense fallback={<CoachHelmSkeleton view="coach" chained />}>
          <CoachBriefView coachId={team.coachId} teamId={team.teamId} section={isBriefSection(section) ? section : null} />
        </Suspense>
      );
    }
    // The Ask sub-tab is the coach's alone: a player's `?view=ask` falls through to their own board below.
    const ask = view === 'ask';
    return (
      <Suspense fallback={ask ? <AskSkeleton chained /> : <CoachHelmSkeleton view="coach" chained />}>
        <CoachHelmView coachId={team.coachId} teamId={team.teamId} ask={ask} conversationId={c} initialPlayer={player} />
      </Suspense>
    );
  }
  if (session.player) {
    const drill = playerHelmDrill(view);
    return (
      <Suspense fallback={viewSkeleton(drill ?? 'board')}>
        {/* `?insight=` names the read the Deep dive opens on, and means nothing on the other views (a view switch carries none). It is only
            read: a pick on the Board or the Deep dive is kept in the tab's session state, and the screens never write the address. */}
        <PlayerHelmView playerId={session.player.id} drill={drill} insight={drill === 'deep-dive' && typeof insight === 'string' ? insight : undefined} at={landsOnGame(view) ? 'game' : undefined} />
      </Suspense>
    );
  }
  return null;
}

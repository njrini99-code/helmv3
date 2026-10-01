import 'server-only';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { Users } from 'lucide-react';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { emptyCoachHelm, loadCoachCoachHelm, loadCoachHelmGate, loadPlayerCoachHelm, loadPlayerHelmGate } from '../data/coachhelm';
import { loadAskCoachHelm } from '../data/coachhelm-chat';
import { loadPlayerProfile } from '../data/coachhelm-profile';
import { loadPlayerStanding } from '../data/coachhelm-standing';
import { PLAYER_HELM_DEVELOPMENT_HREF, playerHelmDrill, type ChViewLoad } from '../data/coachhelm-views-shape';
import { Ask } from '../screens/coachhelm/chat/Ask';
import { AskSkeleton } from '../screens/coachhelm/chat/AskSkeleton';
import { CoachBoard } from '../screens/coachhelm/CoachBoard';
import { PlayerBoard } from '../screens/coachhelm/PlayerBoard';
import { Profile } from '../screens/coachhelm/views/Profile';
import { ProfileSkeleton, StandingSkeleton } from '../screens/coachhelm/views/Skeletons';
import { Standing } from '../screens/coachhelm/views/Standing';
import { EmptyState } from '../ui/States';
import { NotRebuilt } from '../shell/NotRebuilt';
import { resolveClubhouseTeam } from './team';
import '../styles/coachhelm.css';
import '../styles/coachhelm-ask.css';
import '../styles/coachhelm-views.css';
import '../styles/coachhelm-profile.css';
import '../styles/coachhelm-standing.css';

/**
 * /golf/dashboard/coachhelm in Clubhouse, for coaches and players (the Fairway
 * page is the player's only). The role comes from the session. A coach reads
 * their team's players, whichever other teams they staff; a player reads only
 * their own insights, with or without a team, and is never handed a coach control.
 */
/**
 * The Fairway page's `?view=` drills that are not rebuilt yet, which the old /my-development, /my-game-profile and /my-standing
 * addresses (and focus-area cards) redirect to, and the player nav's Deep dive. A link to one says it isn't rebuilt yet rather
 * than landing on the board as if it were (Q-76). `?view=insights` is the board.
 */
const VIEWS_NOT_REBUILT: Record<string, string> = { 'deep-dive': 'Deep dive' };

/**
 * The Ask sub-tab's content (a coach, `?view=ask`, `?c=<conversation>`). Its own async component inside a Suspense boundary, so
 * the page draws the Ask skeleton while the chat context, the pulse and the chats read (`coachhelm/loading.tsx` cannot read `?view=`).
 */
async function AskView({ conversationId }: { conversationId?: string }) {
  return <Ask load={await loadAskCoachHelm({ conversationId })} />;
}

/** A view's content: its own async component inside a Suspense boundary, so the page draws the view's skeleton while it reads. */
async function ProfileView({ playerId }: { playerId: string }) {
  return <Profile load={await loadPlayerProfile({ playerId })} />;
}
async function StandingView({ playerId }: { playerId: string }) {
  return <Standing load={await loadPlayerStanding({ playerId })} />;
}

/**
 * The player's own Game profile, Standing or Deep dive (`?view=`). Read only for the signed-in player (`playerId` is the session's,
 * never the address's) and only once CoachHelm is on for them, as the board is: off is the board's own "CoachHelm is off" page,
 * and a lookup that failed is the view's own "did not load", never a view that reads against a switch that is off. The gate is
 * resolved here so those two answer at once; `coachhelm/loading.tsx` cannot see `?view=`, so each view's read has its own Suspense
 * (keyed, so a switch between views draws the new view's skeleton rather than keeping the old one).
 */
async function playerDrill(drill: 'profile' | 'standing' | 'deep-dive', playerId: string) {
  const gate = await loadPlayerHelmGate(playerId);
  const closed: ChViewLoad<never> | null = gate.status === 'on' ? null : gate.status === 'off' ? { status: 'off', reason: gate.reason } : { status: 'failed' };
  if (drill === 'profile') {
    if (closed) return <Profile load={closed} />;
    return (
      <Suspense key="profile" fallback={<ProfileSkeleton />}>
        <ProfileView playerId={playerId} />
      </Suspense>
    );
  }
  if (drill === 'standing') {
    if (closed) return <Standing load={closed} />;
    return (
      <Suspense key="standing" fallback={<StandingSkeleton />}>
        <StandingView playerId={playerId} />
      </Suspense>
    );
  }
  return null;
}

/** `?player=<golf_players.id>` opens a coach's board on that player (Roster's View insights); an id not on the board is ignored. `?view=ask` (with `?c=`) is the coach's Ask sub-tab. */
export async function ClubhouseCoachHelmRoute({ view, player, c }: { view?: string; player?: string; c?: string } = {}) {
  if (view === 'development') redirect(PLAYER_HELM_DEVELOPMENT_HREF);
  const session = await getGolfSessionProfile();
  if (!session) return null;
  if (session.coach) {
    const team = await resolveClubhouseTeam(session);
    if (!team || team.role !== 'coach') {
      return (
        <main className="ch-hl">
          <EmptyState
            size="page"
            code="CH-13308"
            icon={Users}
            title="You aren't on a team yet"
            body="Once your team is set up, CoachHelm reads the rounds your players post and shows their signals here."
          />
        </main>
      );
    }
    // The Ask sub-tab is the coach's alone: a player's `?view=ask` falls through to their own board below.
    if (view === 'ask') {
      // Ask is CoachHelm's, so it is off when CoachHelm is off for this coach, their team or GolfHelm, as the board is: the
      // address that led here is answered with the board's own "CoachHelm is off" page, and a lookup that failed with Ask's own
      // "did not load" notice, never with a chat that runs against a switch that is off.
      const gate = await loadCoachHelmGate(team.coachId);
      if (gate.status === 'off') return <CoachBoard data={emptyCoachHelm(gate.off)} />;
      if (gate.status === 'failed') return <Ask load={{ status: 'failed' }} />;
      return (
        <Suspense fallback={<AskSkeleton />}>
          <AskView conversationId={c} />
        </Suspense>
      );
    }
    const data = await loadCoachCoachHelm({ coachId: team.coachId, teamId: team.teamId });
    return <CoachBoard data={data} initialPlayer={player} />;
  }
  if (session.player) {
    const drill = playerHelmDrill(view);
    const notYet = drill ? VIEWS_NOT_REBUILT[drill] : undefined;
    if (notYet) return <NotRebuilt label={notYet} />;
    if (drill) return playerDrill(drill, session.player.id);
    const data = await loadPlayerCoachHelm({ playerId: session.player.id });
    return <PlayerBoard data={data} />;
  }
  return null;
}

import 'server-only';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { Users } from 'lucide-react';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { emptyCoachHelm, loadCoachCoachHelm, loadCoachHelmGate, loadPlayerCoachHelm } from '../data/coachhelm';
import { loadAskCoachHelm } from '../data/coachhelm-chat';
import { Ask } from '../screens/coachhelm/chat/Ask';
import { AskSkeleton } from '../screens/coachhelm/chat/AskSkeleton';
import { CoachBoard } from '../screens/coachhelm/CoachBoard';
import { PlayerBoard } from '../screens/coachhelm/PlayerBoard';
import { EmptyState } from '../ui/States';
import { NotRebuilt } from '../shell/NotRebuilt';
import { resolveClubhouseTeam } from './team';
import '../styles/coachhelm.css';
import '../styles/coachhelm-ask.css';

/**
 * /golf/dashboard/coachhelm in Clubhouse, for coaches and players (the Fairway
 * page is the player's only). The role comes from the session. A coach reads
 * their team's players, whichever other teams they staff; a player reads only
 * their own insights, with or without a team, and is never handed a coach control.
 */
/**
 * The Fairway page's `?view=` drills, which the old /my-development, /my-game-profile and /my-standing addresses
 * (and focus-area cards) redirect to, and the player nav's Deep dive. The Clubhouse board is not those views, so a link to one says it isn't rebuilt
 * yet rather than landing on the board as if it were (Q-76). `?view=insights` is the board.
 */
const VIEWS_NOT_REBUILT: Record<string, string> = { profile: 'Game profile', standing: 'Standing', 'deep-dive': 'Deep dive' };

/**
 * `?view=development` is where every stored dev-plan notification points (in-app rows, pushes and emails sent before
 * CH13-7). In Clubhouse a player's development lives on Stats' Development tab, so those links land there (swap audit §14 D4).
 */
const DEVELOPMENT_PATH = '/golf/dashboard/stats?tab=dev';

/**
 * The Ask sub-tab's content (a coach, `?view=ask`, `?c=<conversation>`). Its own async component inside a Suspense boundary, so
 * the page draws the Ask skeleton while the chat context, the pulse and the chats read (`coachhelm/loading.tsx` cannot read `?view=`).
 */
async function AskView({ conversationId }: { conversationId?: string }) {
  return <Ask load={await loadAskCoachHelm({ conversationId })} />;
}

/** `?player=<golf_players.id>` opens a coach's board on that player (Roster's View insights); an id not on the board is ignored. `?view=ask` (with `?c=`) is the coach's Ask sub-tab. */
export async function ClubhouseCoachHelmRoute({ view, player, c }: { view?: string; player?: string; c?: string } = {}) {
  if (view === 'development') redirect(DEVELOPMENT_PATH);
  const notYet = view ? VIEWS_NOT_REBUILT[view] : undefined;
  if (notYet) return <NotRebuilt label={notYet} />;
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
    const data = await loadPlayerCoachHelm({ playerId: session.player.id });
    return <PlayerBoard data={data} />;
  }
  return null;
}

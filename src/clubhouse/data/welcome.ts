import 'server-only';
import { getUnifiedNotifications } from '@/app/golf/actions/unified-notifications';
import { getUserResilient } from '@/lib/auth/resilient-get-user';
import { createClient } from '@/lib/supabase/server';
import { isClubhouseFor } from '../gate';
import { chLogServer } from '../lib/track-server';
import { resolveWelcomeName, shapeWelcomeNews, type ChWelcome } from './welcome-shape';

export type WelcomeLoad = { kind: 'signedOut' } | { kind: 'ready'; data: ChWelcome };

const SURFACE = 'auth';
const AREA = 'golf_auth';

/** What the welcome shows when even the session read threw: the greeting alone, updates marked as not loaded. */
const UNREADABLE: ChWelcome = { name: { status: 'anonymous' }, news: { items: [], first: false, failed: true }, lastSeenAt: null, isAdmin: false, clubhouseDashboard: false };

/**
 * Everything the welcome needs, in one pass. Every read after the session is
 * cosmetic and is allowed to fail: a name that cannot be read greets by the time
 * of day alone, updates that cannot be read say so, and neither stops Continue.
 * Only a session the auth server has ruled invalid sends the person back to sign
 * in (an unreachable auth server falls back to the local session, which is what
 * `getUserResilient` is for, so a slow moment never signs someone out).
 */
export async function loadWelcome(): Promise<WelcomeLoad> {
  const supabase = await createClient();
  let user;
  try {
    ({ user } = await getUserResilient(supabase));
  } catch (error) {
    chLogServer(SURFACE, 'welcome.session', error, AREA);
    return { kind: 'ready', data: UNREADABLE };
  }
  if (!user) return { kind: 'signedOut' };

  const [coach, player, account, feed] = await Promise.all([
    supabase.from('golf_coaches').select('full_name').eq('user_id', user.id).maybeSingle(),
    supabase.from('golf_players').select('first_name').eq('user_id', user.id).maybeSingle(),
    // `last_seen` is read before anything on the dashboard can beat it: it is the previous visit.
    supabase.from('users').select('role, last_seen').eq('id', user.id).maybeSingle(),
    getUnifiedNotifications({ limit: 20 }).catch(() => null),
  ]);

  // CH-15908: a failed read is logged and said on the card, never drawn as nothing new.
  if (coach.error) chLogServer(SURFACE, 'welcome.coach', coach.error, AREA);
  if (player.error) chLogServer(SURFACE, 'welcome.player', player.error, AREA);
  if (account.error) chLogServer(SURFACE, 'welcome.account', account.error, AREA);
  const items = feed?.success && feed.data ? feed.data.items : null;
  if (!items) chLogServer(SURFACE, 'welcome.notifications', new Error(feed?.error ?? 'notifications read failed'), AREA);

  const meta = user.user_metadata as { full_name?: string; name?: string } | undefined;
  const lastSeenAt = (account.data?.last_seen as string | null | undefined) ?? null;
  const role: 'coach' | 'player' | null = coach.data ? 'coach' : player.data ? 'player' : null;
  return {
    kind: 'ready',
    data: {
      name: resolveWelcomeName({
        coachFullName: coach.data?.full_name as string | null | undefined,
        playerFirstName: player.data?.first_name as string | null | undefined,
        accountName: meta?.full_name ?? meta?.name,
      }),
      news: shapeWelcomeNews({ feed: items, lastSeenAt }),
      lastSeenAt,
      isAdmin: (account.data?.role as string | undefined) === 'admin',
      clubhouseDashboard: (await isClubhouseFor(role)),
    },
  };
}

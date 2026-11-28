'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { pageForPath } from '../lib/signal-page';
import { useChSignals } from './use-signals';

/** The front door's Bridge page: signing in, onboarding, and the team and staff invitations a code or link opens. */
const GATE_PAGE = 'P015';

type GateRole = 'coach' | 'player';

/** Who the browser's session says is here: their user id and the role their account declares, if it declares one. */
type GateSession = { userId: string; declared: unknown };

/**
 * The role someone on the front door is there as: the one their account declares, else the one the address is for (a
 * coach's onboarding and the staff invitation are a coach's; a player's onboarding and the team invitation a player's).
 * Null where neither says (signing in, the welcome): their signals wait until the dashboard knows.
 */
export function gateRole(pathname: string, declared: unknown): GateRole | null {
  if (declared === 'coach' || declared === 'player') return declared;
  const part = pathname.split('/').filter(Boolean)[1];
  if (part === 'coach' || part === 'staff') return 'coach';
  if (part === 'player' || part === 'join') return 'player';
  return null;
}

/**
 * The front door's half of the Bridge signals (plan §4.2). The dashboard's shell (ClubhouseFrame) counts its own pages;
 * the front door has no shell, so until now nothing on it counted: not a view, not a tap on its numbered controls, not a
 * sign-in that failed. Mounted once by the golf layout, it does the shell's job on P015's addresses only, and nothing
 * anywhere else, so the two never run together.
 *
 * Signed out, it holds: what happens waits in memory and nothing leaves the browser, because the signal route takes
 * only a signed-in person's signals. A sign-in sends what waited as theirs, counted under the page it happened on.
 * Signed in (onboarding, an invitation), it sends as the shell does. It reads only the session's user id and declared
 * role, which the shell already sends with every signal.
 */
export function GateSignals({ enabled }: { enabled: boolean }) {
  const pathname = usePathname() ?? '';
  if (!enabled || pageForPath(pathname, '', '') !== GATE_PAGE) return null;
  return <GateSignalsOn pathname={pathname} />;
}

function GateSignalsOn({ pathname }: { pathname: string }) {
  const { session, ended } = useGateSession();
  const role = session ? gateRole(pathname, session.declared) : null;
  const known = session !== null && role !== null;
  // Signed out after being someone here (another tab signed out): stop, and drop what waits, so nothing that follows is
  // sent as the person who left or as whoever signs in next. A sign-in starts it again.
  const stopped = ended && !known;
  useChSignals({ enabled: !stopped, hold: !known && !stopped, role: role ?? 'signed-out', teamId: null, userId: known ? session.userId : null, pathname, search: '' });
  return null;
}

/**
 * The browser's session, followed as it changes (a sign-in on this page, a sign-out in another tab): null while signed
 * out, with `ended` once a session this page saw has ended.
 */
function useGateSession(): { session: GateSession | null; ended: boolean } {
  const [state, setState] = useState<{ session: GateSession | null; ended: boolean }>({ session: null, ended: false });
  useEffect(() => {
    let live = true;
    let stop: (() => void) | undefined;
    // Loaded here, not with the layout: only the front door needs the browser client for this.
    import('@/lib/supabase/client')
      .then(({ createClient }) => {
        if (!live) return;
        const { data } = createClient().auth.onAuthStateChange((_event, next) => {
          const user = next?.user;
          setState((now) => {
            if (!user) return now.session ? { session: null, ended: true } : now;
            const declared: unknown = user.user_metadata?.role;
            if (now.session?.userId === user.id && now.session.declared === declared) return now;
            return { session: { userId: user.id, declared }, ended: now.ended };
          });
        });
        stop = () => data.subscription.unsubscribe();
      })
      .catch(() => {
        // No client, no session: the front door's signals keep waiting, as they would signed out.
      });
    return () => {
      live = false;
      stop?.();
    };
  }, []);
  return state;
}

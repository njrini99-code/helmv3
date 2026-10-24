'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { haptic } from '../../lib/haptics';
import { chSignOut } from '../../lib/sign-out';
import { Avatar } from '../../ui/Avatar';
import { AuthNotice } from './AuthNotice';
import { GateFrame, useGateView } from './GateFrame';
import { GateKey } from './gate-fields';

/** How often a waiting page looks again while it is in front of someone, and the least it waits between two looks. */
export const PENDING_RECHECK_MS = 60_000;
export const PENDING_MIN_GAP_MS = 15_000;

/**
 * /golf/coach/pending in Clubhouse: where an assistant coach waits for the head coach to approve them. Today's page
 * (`src/app/golf/(onboarding)/coach/pending/page.tsx`), whose server read decides everything (signed out goes to sign
 * in; approved goes to the dashboard) and which this only draws. Looking again is that same read, run again:
 * `router.refresh()`, which redirects the moment the approval is there. It looks again by itself once a minute while the
 * page is in front of the person and when they come back to the tab, so they are not asked to reload.
 *
 * Sign out really signs out (the current page's link only goes to sign in, which leaves the session in place).
 */
export function CoachPending({ programName, signOut = chSignOut, refresh, initial }: { programName: string | null; signOut?: () => Promise<void>; refresh?: () => void; initial?: { checked?: boolean; signOutFailed?: boolean } }) {
  const router = useRouter();
  const { view, dir, stageRef } = useGateView('waiting');
  const [pending, start] = useTransition();
  const [checkedAt, setCheckedAt] = useState<number | null>(initial?.checked ? Date.now() : null);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutFailed, setSignOutFailed] = useState(!!initial?.signOutFailed);
  const wasPending = useRef(false);
  const lastAt = useRef(0);

  const look = useCallback(() => {
    lastAt.current = Date.now();
    start(() => (refresh ? refresh() : router.refresh()));
  }, [refresh, router]);

  // The look has come back and the page is still here: they are still waiting.
  useEffect(() => {
    if (wasPending.current && !pending) setCheckedAt(Date.now());
    wasPending.current = pending;
  }, [pending]);

  useEffect(() => {
    const due = () => document.visibilityState === 'visible' && Date.now() - lastAt.current >= PENDING_MIN_GAP_MS;
    const tick = window.setInterval(() => due() && look(), PENDING_RECHECK_MS);
    const back = () => due() && look();
    document.addEventListener('visibilitychange', back);
    return () => {
      window.clearInterval(tick);
      document.removeEventListener('visibilitychange', back);
    };
  }, [look]);

  async function out() {
    if (signingOut) return;
    setSigningOut(true);
    setSignOutFailed(false);
    haptic('press');
    try {
      await signOut();
    } catch {
      haptic('error');
      setSignOutFailed(true);
      setSigningOut(false);
    }
  }

  const program = programName ?? 'your program';
  return (
    <GateFrame
      label="Waiting for approval"
      say={{ title: 'Almost on the team.', line: 'Your head coach has your request' }}
      back={null}
      foot={
        <span>
          Expected to be a player? <Link href="/golf/signup">Sign up with your team code</Link>
        </span>
      }
      viewKey={view}
      dir={dir}
      stageRef={stageRef}
    >
      <div className="ch-au-form" data-ch-code="CH-15960">
        <h1>Waiting for approval</h1>
        <p className="ch-au-sub">
          {programName ? (
            <>
              Your request to join <b className="ch-au-who">{programName}</b> as an assistant coach has been sent.
            </>
          ) : (
            'Your account is created and your request has been sent.'
          )}
        </p>
        <div className="ch-au-plate">
          <div className="ch-au-plate__row">
            <Avatar name={program} size="lg" />
            <div>
              <span className="ch-au-plate__k">Who approves</span>
              <b>Your head coach</b>
              <span className="ch-au-plate__s">From the team’s settings in GolfHelm</span>
            </div>
          </div>
          <div className="ch-au-plate__row">
            <span className="ch-au-dot" aria-hidden="true" />
            <div role="status" aria-live="polite">
              <span className="ch-au-plate__k">Status</span>
              <b>{pending ? 'Checking…' : 'Waiting'}</b>
              <span className="ch-au-plate__s">{checkedAt ? 'Checked just now. Nothing yet.' : 'Team data appears the moment they approve.'}</span>
            </div>
          </div>
        </div>
        <p className="ch-au-body">Nothing else is needed from you. We check again when you come back to this page.</p>
        {signOutFailed && (
          <div className="ch-au-err">
            <AuthNotice tone="danger" code="CH-15962">
              We couldn’t sign you out. You’re still signed in. Try again.
            </AuthNotice>
          </div>
        )}
        <GateKey idle="Check again" working="Checking…" busy={pending} type="button" onClick={look} code="CH-15961" />
        <p className="ch-au-alt">
          <button type="button" className="ch-au-linkbtn" onClick={() => void out()} disabled={signingOut}>
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </p>
      </div>
    </GateFrame>
  );
}

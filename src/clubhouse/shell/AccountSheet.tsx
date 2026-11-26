'use client';

import Link from 'next/link';
import { ChevronRight, LifeBuoy, LogOut, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { Avatar } from '../ui/Avatar';
import { Icon } from '../ui/Icon';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/Toast';
import { chSignOut } from '../lib/sign-out';
import { SIGN_OUT_FAILED } from '../lib/sign-out-copy';
import { chReport } from '../lib/track';
import { haptic } from '../lib/haptics';
import { chSetScrim } from '../lib/sheet-drag';
import type { ChRole } from './nav';
import { sectionTitle, useSectionSwitch } from './section-switch';
import { MoreTeamSwitch } from './TeamSwitch';
import type { ChTeamSwitch } from './team-switch';

const SHEET_ID = 'ch-account';

/**
 * The phone's account sheet (CH-1802), opened from the section strip's last pill (docs/clubhouse/phone/section-strip.md).
 * It was the More sheet (D-41); the sections it listed are on the strip now, so what stays is the v2 More board's
 * (m-ch.jsx `MoreM`) who you are (it opens Settings), the coach's team switch, Help and Sign out.
 *
 * It is the shared Modal (OVL-12, OVL-17): the native dialog in the top layer, so the page under it is inert and Tab
 * stays inside without a hand-written trap; its dim and its panel run on one clock; the grab, the header or a pull from
 * the top of its body drags it shut. The strip that held its opener has shut by the time it closes, so focus goes back
 * to the section title, which opens the strip again.
 */
export function AccountSheet({
  pathname,
  role,
  user,
  teamSwitch = null,
}: {
  pathname: string;
  role: ChRole;
  /** headCoach: the coach is the team's head coach, so the line says "Head coach" (ChShellData.viewerIsHeadCoach). */
  user?: { name: string; teamName?: string | null; headCoach?: boolean };
  /** The coach's teams when they can switch among them: the More sheet lists them under who they are. */
  teamSwitch?: ChTeamSwitch | null;
}) {
  const toast = useToast();
  const [leaving, setLeaving] = useState(false);
  const signOut = async () => {
    haptic('press');
    setLeaving(true);
    try {
      await chSignOut();
    } catch (err) {
      // CH-1002: the session is still open, so nothing is lost; say so and let them try again.
      chReport(err, { surface: 'shell.more', action: 'signOut' });
      haptic('error');
      setLeaving(false);
      toast({ tone: 'error', title: SIGN_OUT_FAILED.title, body: SIGN_OUT_FAILED.body, code: 'CH-1002', action: { label: SIGN_OUT_FAILED.retry, run: () => void signOut() } });
    }
  };
  const sw = useSectionSwitch();
  const moreOpen = sw?.accountOpen ?? false;
  const setMoreOpen = useCallback((open: boolean) => sw?.setAccountOpen(open), [sw]);
  const closeMore = useCallback(() => setMoreOpen(false), [setMoreOpen]);
  // A row that navigates (native-feel audit 2026-10-08, P0-3): the sheet and its dim leave at once, in the tap, before
  // the router starts. Left to slide out, they sat in the page transition's snapshot over the old page and the new one.
  const leaveForPage = useCallback(() => {
    haptic('select');
    const dialog = document.getElementById(SHEET_ID);
    if (dialog) {
      dialog.style.visibility = 'hidden';
      chSetScrim(dialog, 0, 0);
    }
    setMoreOpen(false);
  }, [setMoreOpen]);
  // Opened again after a row hid it: seen again (the Modal shows it in this same commit, before paint).
  useLayoutEffect(() => {
    if (moreOpen) document.getElementById(SHEET_ID)?.style.removeProperty('visibility');
  }, [moreOpen]);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- a new address closes the sheet; setMoreOpen is stable enough
  useEffect(() => setMoreOpen(false), [pathname]);

  return (
    <Modal open={moreOpen} onClose={closeMore} title="Account" code="CH-1802" id={SHEET_ID} className="ch-acct" fallbackFocus={sectionTitle}>
      {user && (
        <Link data-ctl="CTL-P001-002" href="/golf/dashboard/settings" className="ch-more__me" onClick={leaveForPage}>
          <Avatar name={user.name} size={44} />
          <span className="ch-more__me-t">
            <b>{user.name}</b>{' '}
            <em>{[role === 'coach' ? (user.headCoach ? 'Head coach' : 'Coach') : 'Player', user.teamName].filter(Boolean).join(' · ')}</em>
          </span>
          <Icon icon={ChevronRight} size={16} />
        </Link>
      )}
      {teamSwitch && <MoreTeamSwitch model={teamSwitch} onSwitched={closeMore} />}
      <div className="ch-more__list">
        {/* A coach's What's new (GAP-R-06): the phone's way to it, as the desktop account menu's row. */}
        {role === 'coach' && (
          <Link data-ctl="CTL-P001-003" href="/golf/dashboard/whats-new" className="ch-more__row" onClick={leaveForPage}>
            <span className="ch-more__ic">
              <Icon icon={Sparkles} size={17} />
            </span>
            <span className="ch-more__label">What’s new</span>
          </Link>
        )}
        <Link data-ctl="CTL-P001-004" href="/golf/dashboard/settings#set-help" className="ch-more__row" onClick={leaveForPage}>
          <span className="ch-more__ic">
            <Icon icon={LifeBuoy} size={17} />
          </span>
          <span className="ch-more__label">Help</span>
        </Link>
        <button data-ctl="CTL-P001-005" type="button" className="ch-more__row" onClick={() => void signOut()} disabled={leaving}>
          <span className="ch-more__ic">
            <Icon icon={LogOut} size={17} />
          </span>
          <span className="ch-more__label">{leaving ? 'Signing out…' : 'Sign out'}</span>
        </button>
      </div>
    </Modal>
  );
}

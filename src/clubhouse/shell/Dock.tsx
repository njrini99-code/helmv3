'use client';

import Link from 'next/link';
import { ChevronRight, Flag } from 'lucide-react';
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { ChRoundInProgress } from '../data/shell';
import { haptic } from '../lib/haptics';
import { useChPhone } from '../lib/use-phone';
import { Icon } from '../ui/Icon';
import { rebuiltHref } from './nav';
import { usePhoneChromeState } from './phone-chrome';

/**
 * The phone's dock: the band just above the tab bar, within the thumb's reach (owner, 2026-10-08).
 *
 *   <ThumbDock label="…">…</ThumbDock>   a page mounts its primary controls here on a phone (a window switch, a
 *                                        search). On desktop it renders nothing: the page keeps them in place.
 *   Resume round                         the shell's accessory while the player has a round in progress (P001-C1):
 *                                        one tap goes back to the shot screen. The in-app twin of a Live Activity.
 *
 * The dock hides with the tab bar (a pushed screen, a full-page form) and while the keyboard is up, and the canvas
 * grows by its height (`--ch-dock-h`) so the last row of a page still clears it.
 */
interface DockCtx {
  slot: HTMLElement | null;
  setSlot: (el: HTMLElement | null) => void;
  pages: number;
  setPages: (fn: (n: number) => number) => void;
}

const Dock = createContext<DockCtx>({ slot: null, setSlot: () => {}, pages: 0, setPages: () => {} });

export function DockProvider({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [pages, setPages] = useState(0);
  return <Dock.Provider value={{ slot, setSlot, pages, setPages }}>{children}</Dock.Provider>;
}

/** A page's primary controls, lowered into the thumb dock on a phone. Renders nothing on desktop. */
export function ThumbDock({ label, children }: { /** Names the group for VoiceOver ("Calendar view"). */ label: string; children: ReactNode }) {
  const { slot, setPages } = useContext(Dock);
  const phone = useChPhone();
  useLayoutEffect(() => {
    if (!phone) return;
    setPages((n) => n + 1);
    return () => setPages((n) => n - 1);
  }, [phone, setPages]);
  if (!phone || !slot) return null;
  return createPortal(
    <div className="ch-dock__page" role="group" aria-label={label}>
      {children}
    </div>,
    slot,
  );
}

/** Routes where the round itself is on screen, so the accessory would point at the page the player is already on. */
const ROUND_SCREENS = /^\/golf\/dashboard\/rounds\/(continue|new)(\/|$)/;

export function resumeRoundHref(round: ChRoundInProgress): string | null {
  return rebuiltHref(`/golf/dashboard/rounds/continue/${round.id}`, 'player');
}

export function resumeRoundLabel(round: ChRoundInProgress): string {
  return round.hole ? `${round.course} · Hole ${round.hole}` : round.course;
}

/** The shell's dock, above the phone tab bar: the page's controls, then the Resume round accessory. */
export function PhoneDock({ round, pathname }: { round: ChRoundInProgress | null; pathname: string }) {
  const { setSlot, pages } = useContext(Dock);
  const { immersive, noTabs } = usePhoneChromeState();
  const ref = useRef<HTMLDivElement>(null);
  const href = round && !ROUND_SCREENS.test(pathname) ? resumeRoundHref(round) : null;
  const shown = !immersive && !noTabs && (pages > 0 || !!href);

  // The canvas grows by the dock's height (the spacer in ClubhouseFrame reads it), so nothing ends up under it.
  useEffect(() => {
    const el = ref.current;
    const root = el?.closest<HTMLElement>('.ch-root');
    if (!el || !root) return;
    const write = () => root.style.setProperty('--ch-dock-h', shown ? `${Math.ceil(el.offsetHeight)}px` : '0px');
    write();
    if (!shown || typeof ResizeObserver === 'undefined') return () => root.style.removeProperty('--ch-dock-h');
    const ro = new ResizeObserver(write);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty('--ch-dock-h');
    };
  }, [shown]);

  return (
    <div ref={ref} className="ch-dock" data-ch-code="CH-1820" hidden={!shown}>
      <div ref={setSlot} className="ch-dock__slot" />
      {href && round && (
        <Link
          href={href}
          className="ch-resume"
          data-ch-code="CH-1821"
          aria-label={`Resume round, ${resumeRoundLabel(round)}`}
          onClick={() => haptic('press')}
        >
          <span className="ch-resume__ic" aria-hidden="true">
            <Icon icon={Flag} size={15} />
          </span>
          <span className="ch-resume__t">
            <b>Round in progress</b>
            <span className="ch-resume__m">{resumeRoundLabel(round)}</span>
          </span>
          <span className="ch-resume__go" aria-hidden="true">
            Resume
            <Icon icon={ChevronRight} size={15} />
          </span>
        </Link>
      )}
    </div>
  );
}

/** Desktop: the sidebar's card slot while a round is open ("Round in progress · Resume"), in place of the next event. */
export function ResumeRoundCard({ round }: { round: ChRoundInProgress }) {
  const href = resumeRoundHref(round);
  if (!href) return null;
  return (
    <Link href={href} className="ch-next ch-next--round" data-ch-code="CH-1822" aria-label={`Resume round, ${resumeRoundLabel(round)}`}>
      <span className="ch-next__k">
        <span>Round in progress</span>
        <span>Resume</span>
      </span>
      <span className="ch-next__t">{round.course}</span>
      {round.hole && <span className="ch-next__m ch-num">Hole {round.hole}</span>}
    </Link>
  );
}

'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight, Flag, Trash2, X } from 'lucide-react';
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { ChRoundInProgress } from '../data/shell';
import { formatToPar } from '../lib/format';
import { haptic } from '../lib/haptics';
import { useChPhone } from '../lib/use-phone';
import { Icon } from '../ui/Icon';
import { Modal } from '../ui/Modal';
import { DiscardConfirm } from '../screens/rounds/entry/parts';
import { failureLine } from '../screens/rounds/entry/labels';
import { discardRoundInProgress } from './discard-round';
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
  if (!round.hole) return round.course;
  // P-6: the score so far rides with the hole ("Oakmont CC · Hole 12 · −2"); nothing scored yet, no figure.
  return `${round.course} · Hole ${round.hole}${round.toPar != null ? ` · ${formatToPar(round.toPar)}` : ''}`;
}

/** The shell's dock, above the phone tab bar: the page's controls, then the Resume round accessory. */
export function PhoneDock({ round, pathname }: { round: ChRoundInProgress | null; pathname: string }) {
  const { setSlot, pages } = useContext(Dock);
  const { immersive, noTabs, dockKept } = usePhoneChromeState();
  const ref = useRef<HTMLDivElement>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const href = round && !ROUND_SCREENS.test(pathname) ? resumeRoundHref(round) : null;
  // A push that is not immersive keeps the Resume round accessory (never an empty dock): PhoneScreen, shell-gestures.md.
  const shown = (!immersive && !noTabs && (pages > 0 || !!href)) || (dockKept && !noTabs && !!href);

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
        <div className="ch-resume">
          <Link
            href={href}
            className="ch-resume__link"
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
          {round.playerId && (
            <button
              type="button"
              className="ch-resume__x"
              data-ch-code="CH-1823"
              aria-label={`Discard round, ${resumeRoundLabel(round)}`}
              onClick={() => {
                haptic('press');
                setDiscardOpen(true);
              }}
            >
              <Icon icon={X} size={16} />
            </button>
          )}
        </div>
      )}
      {round?.playerId && <DiscardRoundModal round={round} playerId={round.playerId} open={discardOpen} onClose={() => setDiscardOpen(false)} />}
    </div>
  );
}

/**
 * The Resume bar's discard (owner, 2026-10-31: "let me discard it"): the scorecard's own question (CH-11515), then the
 * scorecard's own steps (discard-round.ts). On success the shell reads again, so the bar goes.
 */
function DiscardRoundModal({ round, playerId, open, onClose }: { round: ChRoundInProgress; playerId: string; open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const close = () => {
    if (busy) return;
    setError(null);
    onClose();
  };
  return (
    <Modal open={open} onClose={close} title="Round in progress" icon={Trash2} width={480} code="CH-1824">
      <DiscardConfirm
        code="CH-11515"
        label="Discard the round in progress"
        title="Discard this round?"
        body={`${resumeRoundLabel(round)}. This can’t be undone.`}
        error={error != null ? failureLine('Couldn’t discard the round.', error || null, 'It is still saved. Try again, or resume it instead.') : null}
        errorCode="CH-11009"
        busy={busy}
        onKeep={close}
        onDiscard={async () => {
          setBusy(true);
          setError(null);
          const result = await discardRoundInProgress(round.id, playerId);
          setBusy(false);
          if (!result.ok) {
            haptic('error');
            setError(result.error ?? '');
            // A refusal can mean the round already finished or went elsewhere: read the shell again so the bar follows.
            router.refresh();
            return;
          }
          haptic('success');
          onClose();
          router.refresh();
        }}
      />
    </Modal>
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
      {round.hole && (
        <span className="ch-next__m ch-num">
          Hole {round.hole}
          {round.toPar != null && ` · ${formatToPar(round.toPar)}`}
        </span>
      )}
    </Link>
  );
}

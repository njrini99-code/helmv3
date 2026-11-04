'use client';

import { useEffect, useRef, type MouseEvent, type ReactNode, type RefObject } from 'react';
import { PhoneBar } from '../../ui/PhoneBar';
import { PhoneScreen } from '../../shell/PhoneScreen';
import { useChReducedMotion } from '../../lib/reduced-motion';
import { useGrowOnce } from './shs-motion';

/** Focus moves to Back this long after a keyboard push (07 M-STATS-27; at once under Reduce Motion). */
const FOCUS_BACK_MS = 80;
/** The house push settles at 462ms. */
const PUSH_SETTLE_MS = 462;

/**
 * One pushed Stats detail: the house's PhoneScreen and pushed bar ("‹ My stats", the page's name centred, no bell) over a scrolling
 * body. Render it inside `AnimatePresence initial={false}` so an arrival shows in place. `loading` is the deep link that arrives before
 * its data: the bar is known from the hash and works; the body is a skeleton (S-STATS.detail-loading).
 */
export function StatsDetailScreen({
  id,
  title,
  backLabel,
  onBack,
  children,
  loading = false,
  keyboard = false,
  scrollRef,
  restoreScroll,
  onLeave,
  big = false,
  anchor,
}: {
  id: string;
  title: string;
  backLabel: string;
  onBack: () => void;
  children?: ReactNode;
  loading?: boolean;
  /** Opened from the keyboard: focus goes to Back shortly after. */
  keyboard?: boolean;
  scrollRef?: RefObject<HTMLElement | null>;
  /** Scroll to put back on a back-forward arrival (S-STATS.return). */
  restoreScroll?: number | null;
  /** A link inside is about to leave the page. */
  onLeave?: () => void;
  /** Text Size Larger and XXL reflow its cards (08 criterion 20). */
  big?: boolean;
  /** Scroll this `data-ch-anchor` into view once the push has settled (What changed to Against the N before). */
  anchor?: string | null;
}) {
  const reduced = useChReducedMotion();
  const titleId = `ch-shs-d-${id}-t`;
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!keyboard) return;
    const timer = window.setTimeout(() => body.current?.closest('.ch-pscreen')?.querySelector<HTMLElement>('.ch-pbar__back')?.focus({ preventScroll: true }), reduced ? 0 : FOCUS_BACK_MS);
    return () => window.clearTimeout(timer);
  }, [keyboard, reduced]);
  // Each detail opens at its own top; a Back onto one comes back where it was.
  useEffect(() => {
    if (body.current) body.current.scrollTop = restoreScroll ?? 0;
  }, [id, restoreScroll]);
  useGrowOnce(body, reduced, [id, loading]);
  useEffect(() => {
    if (!anchor || loading) return;
    const timer = window.setTimeout(() => body.current?.querySelector(`[data-ch-anchor="${anchor}"]`)?.scrollIntoView({ block: 'start', behavior: 'auto' }), reduced ? 0 : PUSH_SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [anchor, loading, reduced]);
  const leaving = (e: MouseEvent<HTMLDivElement>) => {
    if ((e.target as Element).closest?.('a[href]')) onLeave?.();
  };
  return (
    <PhoneScreen labelledBy={titleId} className={'ch-shs-screen' + (big ? ' is-big' : '')}>
      <PhoneBar back={{ label: backLabel, onBack, hook: 'stats-back' }} title={title} titleId={titleId} action={<span className="ch-shs-d-slot" aria-hidden="true" />} />
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- only watches for a link leaving; every control inside has its own keys */}
      <div
        role="group"
        className="ch-shs-d-body"
        data-ch-shs-detail={id}
        ref={(el) => {
          body.current = el;
          if (scrollRef) scrollRef.current = el;
        }}
        aria-busy={loading || undefined}
        aria-label={loading ? `Loading ${title}` : undefined}
        onClickCapture={leaving}
      >
        <div className="ch-shs-d-sheet">{loading ? <DetailSkeleton /> : children}</div>
      </div>
    </PhoneScreen>
  );
}

/** The detail's skeleton (06 S-STATS.detail-loading): the hero's place, then two cards. Decorative. */
function DetailSkeleton() {
  return (
    <div className="ch-shs-is-loading" aria-hidden="true">
      <div className="ch-shs-d-hero">
        <span className="ch-shs-skel ch-shs-skel--hero" />
        <span className="ch-shs-skel ch-shs-skel--cap" />
      </div>
      {[0, 1].map((i) => (
        <div key={i} className="ch-shs-card ch-shs-skel-card ch-shs-skel-card--d">
          <span className="ch-shs-skel ch-shs-skel--t" />
          <span className="ch-shs-skel ch-shs-skel--v" />
          <span className="ch-shs-skel ch-shs-skel--blk" />
        </div>
      ))}
    </div>
  );
}

/**
 * The first block of every detail, on the page, not in a card: the figure (500 40/1), its caption, then its chips.
 * A summary card and its hero read one value (one source per figure).
 */
export function DetailHero({ figure, unit, caption, chips }: { figure: ReactNode; unit?: string; caption: ReactNode; chips?: ReactNode }) {
  return (
    <div className="ch-shs-d-hero">
      <span className="ch-shs-d-hero__fig ch-num">
        {figure}
        {unit && <small>{unit}</small>}
      </span>
      <p className="ch-shs-d-hero__cap">{caption}</p>
      {chips && <div className="ch-shs-d-hero__chips">{chips}</div>}
    </div>
  );
}

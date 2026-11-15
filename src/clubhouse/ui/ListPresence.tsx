'use client';

import { AnimatePresence, m, useIsPresent } from 'motion/react';
import { Children, createContext, isValidElement, useCallback, useContext, useEffect, useRef, useState, type HTMLAttributes, type ReactNode, type Ref, type RefObject } from 'react';
import { CH_DUR, CH_EASE, CH_EASE_SHEET, chSpringCurve, CH_SPRING_SETTLE_MS } from '../lib/motion';
import { useChMotionMode, type ChMotionMode } from '../lib/reduced-motion';

/**
 * Rows that arrive and leave in place (B7, S3.10). A list keyed by its rows wraps them in `ListPresence`, and each row's
 * root is a `PresenceRow` (the row itself, so the list's sibling rules still hold): a new row takes its height at once and
 * rises 8px as it fades in over the base beat (260ms); a removed row stays mounted (`data-leaving`, hidden from assistive
 * tech and focus) while it fades and shrinks to .96 over the quick beat (180ms), then unmounts, and the rows around it
 * slide to their new places by transform (FLIP, 260ms), as a row that moves does. Nothing animates a height, so no frame
 * of it is laid out on the main thread. Rows are measured only when the list's keys change, or a leaving row has gone;
 * first paint never animates. Under Reduce Motion a row fades in or out over the quick beat with nothing moving, never a
 * snap; with Animations off rows come and go at once (the same elements either way: turning a setting over mid-list
 * remounts nothing), and a `PresenceRow` outside a `ListPresence` is a plain row.
 * `flip={false}` keeps arrivals and leavings but not the slide to a new place, for a list inside a scroller that sets its
 * own position as rows come (a message thread, use-thread-anchor.ts): FLIP would read that scroll as every row moving.
 *
 *   <ul><ListPresence>{trips.map((t) => <Trip key={t.id} …/>)}</ListPresence></ul>   // Trip's root: <PresenceRow as="li">
 */

/**
 * What the rows read from their list: `keys` changes when a row comes or goes and again once a leaving row has gone (the
 * FLIP's trigger), and whether it has painted (a row that mounts after is an arrival); null outside a ListPresence.
 */
const ListCtx = createContext<{ keys: string; painted: RefObject<boolean>; flip: boolean; motion: ChMotionMode; inbox: boolean; cut: boolean } | null>(null);

/**
 * The default arrival rises 8px and fades in with its height taken at once (owner, 2026-10-31, as Fairway's thread does,
 * now every list's, S3.10): opening its height would push every row above or below it frame by frame, and in a message
 * thread that re-pins its end it jittered on send. `arrive="rise"` names it explicitly.
 */
export function ListPresence({ children, flip = true, arrive = 'rise', cut = false }: { children: ReactNode; flip?: boolean; /** `inbox` (Messages' redesign, 07 M-MSG-03b and CP-11): a row arrives by fading in its place, leaves by fading and shrinking to .96 over 180ms, and rows glide on the 462ms push. */ arrive?: 'rise' | 'inbox'; /** With `inbox`: rows leaving go in one frame (a filter change, not a row leaving the list). */ cut?: boolean }) {
  const motion = useChMotionMode();
  const painted = useRef(false);
  useEffect(() => {
    painted.current = true;
  }, []);
  // Bumped in the render that unmounts the rows that left, so the rows around them measure that render and slide into
  // the room they left (S3.10: leave, then unmount, then FLIP) instead of jumping.
  const [gone, setGone] = useState(0);
  const keys =
    Children.toArray(children)
      .map((c) => (isValidElement(c) ? String(c.key) : ''))
      .join('|') + `#${gone}`;
  return (
    <ListCtx.Provider value={{ keys, painted, flip, motion, inbox: arrive === 'inbox', cut }}>
      <AnimatePresence initial={false} onExitComplete={flip && motion === 'full' ? () => setGone((n) => n + 1) : undefined}>
        {children}
      </AnimatePresence>
    </ListCtx.Provider>
  );
}

type RowTag = 'li' | 'div' | 'article' | 'section' | 'button';
/** A row's own attributes; a button row takes its `type`. */
type RowProps = HTMLAttributes<HTMLElement> & { type?: 'button' };

/**
 * Whether the row that calls this mounted after its list had painted (an arrival, not first paint), latched at mount. For a
 * row that plays something once it has arrived (Messages' receipt rise); false outside a `ListPresence`.
 */
export function useRowArrived(): boolean {
  const list = useContext(ListCtx);
  const [arrived] = useState(() => !!list && list.painted.current);
  return arrived;
}

export function PresenceRow({
  as = 'li',
  children,
  ref,
  noArrival = false,
  ...rest
}: {
  as?: RowTag;
  children: ReactNode;
  ref?: Ref<HTMLElement>;
  /**
   * The row has a motion of its own when it arrives (your own sent message flies out of the field; a reply grows out of the
   * typing bubble), so the list's arrival (the 8px rise) is skipped. Leaving is unchanged: a deleted message still fades
   * and shrinks in place.
   */
  noArrival?: boolean;
} & RowProps) {
  const list = useContext(ListCtx);
  if (list == null) {
    const Tag = as as 'div';
    return (
      <Tag ref={ref as Ref<HTMLDivElement>} {...rest}>
        {children}
      </Tag>
    );
  }
  return (
    <Moving as={as} keys={list.keys} flip={list.flip && list.motion === 'full'} motion={list.motion} noArrival={noArrival} inbox={list.inbox} cut={list.cut} arrives={list.painted.current} rowRef={ref} {...rest}>
      {children}
    </Moving>
  );
}

function Moving({ as, keys, flip, motion, noArrival, inbox, cut, arrives, rowRef, children, ...rest }: { as: RowTag; keys: string; flip: boolean; motion: ChMotionMode; noArrival: boolean; inbox: boolean; cut: boolean; arrives: boolean; rowRef?: Ref<HTMLElement>; children: ReactNode } & RowProps) {
  const present = useIsPresent();
  // A row there at first paint is never styled by the list; one that arrives later rises (or, under Reduce Motion, fades)
  // in, then hands its opacity and transform back to its own stylesheet. With Animations off nothing moves or fades.
  const [arrived] = useState(arrives);
  const arriving = arrived && motion !== 'off' && !noArrival;
  const fade = motion === 'fade';
  const el = useRef<HTMLElement | null>(null);
  const ref = useCallback(
    (node: HTMLElement | null) => {
      el.current = node;
      if (typeof rowRef === 'function') rowRef(node);
      else if (rowRef) (rowRef as { current: HTMLElement | null }).current = node;
    },
    [rowRef],
  );
  const settle = () => {
    if (!present || !el.current) return;
    for (const p of ['opacity', 'transform']) el.current.style.removeProperty(p);
  };
  const Row = ROW[as] as typeof m.div;
  return (
    <Row
      {...(rest as object)}
      ref={ref}
      layout={flip ? 'position' : undefined}
      layoutDependency={flip ? keys : undefined}
      data-leaving={present ? undefined : ''}
      aria-hidden={present ? rest['aria-hidden'] : true}
      inert={!present}
      initial={arriving ? (fade ? FADE_FROM : inbox ? INBOX_FROM : RISE_FROM) : false}
      animate={arriving ? (fade ? FADED_IN : inbox ? INBOX_SHOWN : RISEN) : undefined}
      onAnimationComplete={arriving ? settle : undefined}
      exit={motion === 'off' ? undefined : fade ? FADE_OUT : inbox ? (cut ? INBOX_CUT : INBOX_LEAVE) : LEAVE}
      transition={inbox ? PUSH : MOVE}
    >
      {children}
    </Row>
  );
}

const ROW = { li: m.li, div: m.div, article: m.article, section: m.section, button: m.button } as const;

/**
 * S3.10's curve, the iOS ease-out. It is `CH_EASE_SHEET` (`--ch-ease-sheet`) today; when lib/motion.ts names the one
 * curve (`--ch-ease-ios`, the same points), point this at it and nothing else here changes.
 */
const LIST_EASE = CH_EASE_SHEET;
/** Rows around an arrival or a leaving row slide to their new places by transform (FLIP), on the base beat (260ms). */
const MOVE = { duration: CH_DUR.base, ease: LIST_EASE };
/** Messages' inbox, on the house push's clock. */
const PUSH = { duration: CH_SPRING_SETTLE_MS / 1000, ease: chSpringCurve('smooth').ease };
const INBOX_FROM = { opacity: 0 };
const INBOX_SHOWN = { opacity: 1, transition: PUSH };
const INBOX_LEAVE = { opacity: 0, scale: 0.96, transition: { duration: CH_DUR.quick, ease: CH_EASE } };
const INBOX_CUT = { opacity: 0, transition: { duration: 0 } };
// Arrival and leaving move on the compositor only (opacity and a transform string, which Motion hands to WAAPI).
const RISE_FROM = { opacity: 0, transform: 'translateY(8px)' };
const RISEN = { opacity: 1, transform: 'translateY(0px)', transition: { duration: CH_DUR.base, ease: LIST_EASE } };
const LEAVE = { opacity: 0, transform: 'scale(0.96)', transition: { duration: CH_DUR.quick, ease: LIST_EASE } };
/** Reduce Motion: the quick-beat fade, opacity only, never a snap (MOT-04, S3.10). */
const FADE = { duration: CH_DUR.quick, ease: LIST_EASE };
const FADE_FROM = { opacity: 0 };
const FADED_IN = { opacity: 1, transition: FADE };
const FADE_OUT = { opacity: 0, transition: FADE };

'use client';

import { AnimatePresence, m, useIsPresent } from 'motion/react';
import { Children, createContext, isValidElement, useCallback, useContext, useEffect, useRef, useState, type HTMLAttributes, type ReactNode, type Ref, type RefObject } from 'react';
import { CH_DUR, CH_EASE_IOS, CH_EASE_OUT } from '../lib/motion';
import { useChMotionMode, type ChMotionMode } from '../lib/reduced-motion';

/**
 * Rows that arrive and leave in place: the one list insert and remove (MOTION-AND-VISUAL 3.5; production audit 2026-11-15,
 * S3.10, MOT-04). A list keyed by its rows wraps them in `ListPresence`, and each row's root is a `PresenceRow` (the row
 * itself, so the list's sibling rules still hold).
 *   Insert (a round you just saved, a sent message): the row takes its height at once and rises 8px as it fades in, over
 *   the base beat (260ms) on the iOS curve; the rows around it slide to their new places by transform (FLIP, 260ms, iOS).
 *   Remove: the row stays mounted (`data-leaving`, hidden from assistive tech and focus) while it fades and shrinks to .96
 *   over the quick beat (180ms, ease-out, as things leave), then unmounts, and the rows around it FLIP into the room it left.
 *   First paint never animates, and nothing animates a height, so no frame of it is laid out on the main thread. Rows are
 *   measured only when the list's keys change, or a leaving row has gone.
 *   Reduce Motion: a row fades in or out over the quick beat with nothing moving, never a snap. Animations off: rows come
 *   and go at once (the same elements either way: turning a setting over mid-list remounts nothing). A `PresenceRow`
 *   outside a `ListPresence` is a plain row.
 * `flip={false}` keeps arrivals and leavings but not the slide to a new place, for a list inside a scroller that sets its
 * own position as rows come (a message thread: use-thread-anchor.ts, and useThreadMakeRoom moves the rows above instead):
 * FLIP would read that scroll as every row moving. `cut` (a filter or search change, which swaps the list's content rather
 * than adding to it): in that render the rows that leave go, the rows that come appear and the rest take their new places,
 * all at once (3.3: content swaps instantly).
 *
 *   <ul><ListPresence>{trips.map((t) => <Trip key={t.id} …/>)}</ListPresence></ul>   // Trip's root: <PresenceRow as="li">
 */

/**
 * What the rows read from their list: `keys` changes when a row comes or goes and again once a leaving row has gone (the
 * FLIP's trigger), and whether it has painted (a row that mounts after is an arrival); null outside a ListPresence.
 */
const ListCtx = createContext<{ keys: string; painted: RefObject<boolean>; flip: boolean; motion: ChMotionMode; cut: boolean } | null>(null);

export function ListPresence({ children, flip = true, cut = false }: { children: ReactNode; flip?: boolean; /** This render swaps the list's content (a filter or search change): nothing moves. */ cut?: boolean }) {
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
    <ListCtx.Provider value={{ keys, painted, flip, motion, cut }}>
      <AnimatePresence initial={false} onExitComplete={flip && motion === 'full' ? () => setGone((n) => n + 1) : undefined}>
        {children}
      </AnimatePresence>
    </ListCtx.Provider>
  );
}

type RowTag = 'li' | 'div' | 'article' | 'section' | 'button';
/** A row's own attributes; a button row takes its `type`. */
type RowProps = HTMLAttributes<HTMLElement> & { type?: 'button' };

export function PresenceRow({ as = 'li', children, ref, ...rest }: { as?: RowTag; children: ReactNode; ref?: Ref<HTMLElement> } & RowProps) {
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
    <Moving as={as} keys={list.keys} flip={list.flip && list.motion === 'full'} motion={list.motion} cut={list.cut} arrives={list.painted.current && !list.cut} rowRef={ref} {...rest}>
      {children}
    </Moving>
  );
}

function Moving({ as, keys, flip, motion, cut, arrives, rowRef, children, ...rest }: { as: RowTag; keys: string; flip: boolean; motion: ChMotionMode; cut: boolean; arrives: boolean; rowRef?: Ref<HTMLElement>; children: ReactNode } & RowProps) {
  const present = useIsPresent();
  // A row there at first paint, or one a cut brings, is never styled by the list; one that arrives later rises (or, under
  // Reduce Motion, fades) in, then hands its opacity and transform back to its own stylesheet. With Animations off nothing
  // moves or fades.
  const [arrived] = useState(arrives);
  const arriving = arrived && motion !== 'off';
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
      initial={arriving ? (fade ? FADE_FROM : RISE_FROM) : false}
      animate={arriving ? (fade ? FADED_IN : RISEN) : undefined}
      onAnimationComplete={arriving ? settle : undefined}
      exit={motion === 'off' ? undefined : cut ? CUT : fade ? FADE_OUT : LEAVE}
      transition={cut ? AT_ONCE : MOVE}
    >
      {children}
    </Row>
  );
}

const ROW = { li: m.li, div: m.div, article: m.article, section: m.section, button: m.button } as const;

/** Rows around an arrival or a leaving row slide to their new places by transform (FLIP), on the base beat (260ms), iOS curve. */
const MOVE = { duration: CH_DUR.base, ease: CH_EASE_IOS };
/** A cut: the content swaps in one frame. */
const AT_ONCE = { duration: 0 };
const CUT = { opacity: 0, transition: AT_ONCE };
// Arrival and leaving move on the compositor only (opacity and a transform string, which Motion hands to WAAPI).
/** Insert: an 8px rise with the fade in, on the base beat and the iOS curve (3.5). */
const RISE_FROM = { opacity: 0, transform: 'translateY(8px)' };
const RISEN = { opacity: 1, transform: 'translateY(0px)', transition: MOVE };
/** Remove: to .96 and transparent over the quick beat, on ease-out (3.5; 3.2, things leaving). */
const LEAVE = { opacity: 0, transform: 'scale(0.96)', transition: { duration: CH_DUR.quick, ease: CH_EASE_OUT } };
/** Reduce Motion: the quick-beat fade, opacity only, never a snap (3.11, MOT-04). */
const FADE = { duration: CH_DUR.quick, ease: CH_EASE_OUT };
const FADE_FROM = { opacity: 0 };
const FADED_IN = { opacity: 1, transition: FADE };
const FADE_OUT = { opacity: 0, transition: FADE };

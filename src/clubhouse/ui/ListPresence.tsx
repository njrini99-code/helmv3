'use client';

import { AnimatePresence, m, useIsPresent } from 'motion/react';
import { Children, createContext, isValidElement, useCallback, useContext, useEffect, useRef, useState, type HTMLAttributes, type ReactNode, type Ref, type RefObject } from 'react';
import { CH_DUR, CH_EASE, chSpringCurve } from '../lib/motion';
import { useChReducedMotion } from '../lib/reduced-motion';

/**
 * Rows that arrive and leave in place (B7). A list keyed by its rows wraps them in `ListPresence`, and each row's root is
 * a `PresenceRow` (the row itself, so the list's sibling rules still hold): a new row opens its height and fades in, a
 * removed row stays mounted (`data-leaving`, hidden from assistive tech and focus) while its height, padding and rules
 * close, clipped, so the rows below slide up instead of jumping, and a row that moves slides to its new place (FLIP, by
 * transform). Rows are measured only when the list's keys change; first paint never animates. Reduced motion and
 * Animations off render plain rows that come and go at once, and so does a `PresenceRow` outside a `ListPresence`.
 *
 *   <ul><ListPresence>{trips.map((t) => <Trip key={t.id} …/>)}</ListPresence></ul>   // Trip's root: <PresenceRow as="li">
 */

/** The list's keys in order, and whether it has painted (a row that mounts after is an arrival); null outside a ListPresence. */
const ListCtx = createContext<{ keys: string; painted: RefObject<boolean> } | null>(null);

export function ListPresence({ children }: { children: ReactNode }) {
  const reduced = useChReducedMotion();
  const painted = useRef(false);
  useEffect(() => {
    painted.current = true;
  }, []);
  if (reduced) return <>{children}</>;
  const keys = Children.toArray(children)
    .map((c) => (isValidElement(c) ? String(c.key) : ''))
    .join('|');
  return (
    <ListCtx.Provider value={{ keys, painted }}>
      <AnimatePresence initial={false}>{children}</AnimatePresence>
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
    <Moving as={as} keys={list.keys} arrives={list.painted.current} rowRef={ref} {...rest}>
      {children}
    </Moving>
  );
}

function Moving({ as, keys, arrives, rowRef, children, ...rest }: { as: RowTag; keys: string; arrives: boolean; rowRef?: Ref<HTMLElement>; children: ReactNode } & RowProps) {
  const present = useIsPresent();
  // A row there at first paint is never styled by the list; one that arrives later opens in, then hands its height,
  // opacity and overflow back to its own stylesheet.
  const [arriving] = useState(arrives);
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
    for (const p of ['height', 'opacity', 'overflow']) el.current.style.removeProperty(p);
  };
  const Row = ROW[as] as typeof m.div;
  return (
    <Row
      {...(rest as object)}
      ref={ref}
      layout="position"
      layoutDependency={keys}
      data-leaving={present ? undefined : ''}
      aria-hidden={present ? rest['aria-hidden'] : true}
      inert={!present}
      initial={arriving ? ENTER : false}
      animate={arriving ? SHOWN : undefined}
      onAnimationComplete={arriving ? settle : undefined}
      exit={LEAVE}
      transition={MOVE}
    >
      {children}
    </Row>
  );
}

const ROW = { li: m.li, div: m.div, article: m.article, section: m.section, button: m.button } as const;

/**
 * About 260ms on the smooth spring, as its timed curve (a framer spring never settles over no distance, as a row that
 * measures 0 would): the height opens or closes with the content clipped, the fade a touch quicker.
 */
const SMOOTH = chSpringCurve('smooth');
const MOVE = { duration: SMOOTH.ms / 1000, ease: SMOOTH.ease };
const ENTER = { height: 0, opacity: 0, overflow: 'clip' as const };
const SHOWN = {
  height: 'auto',
  opacity: 1,
  transition: { height: MOVE, opacity: { duration: CH_DUR.base, ease: CH_EASE } },
};
// The row's own padding, margins and rules close with it, so it ends at nothing and unmounting moves no pixel.
const LEAVE = {
  height: 0,
  opacity: 0,
  paddingTop: 0,
  paddingBottom: 0,
  marginTop: 0,
  marginBottom: 0,
  borderTopWidth: 0,
  borderBottomWidth: 0,
  overflow: 'clip' as const,
  transition: { default: MOVE, opacity: { duration: CH_DUR.quick, ease: CH_EASE } },
};

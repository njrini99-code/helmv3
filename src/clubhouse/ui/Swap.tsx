'use client';

import { AnimatePresence, m, useIsPresent } from 'framer-motion';
import type { ReactNode } from 'react';
import { CH_DUR, CH_EASE } from '../lib/motion';
import { useChReducedMotion } from '../lib/reduced-motion';

/**
 * A content swap inside a fixed frame (owner, 2026-10-07: "super duper premium" motion). When `swapKey` changes the
 * old content leaves and the new arrives in the same place: `settle` crossfades with a 6px rise (a tab's panel, a
 * chart's mode, a window's figures); `slide` moves 12px in the direction of travel (a pager, the next hole). The
 * incoming copy takes the base duration and the outgoing the quick one, so the new content is always the one being
 * read. First paint never animates (`initial={false}`), reduced motion and Animations off swap instantly, and the
 * leaving copy is hidden from assistive tech and focus while it fades.
 */
export function Swap({
  swapKey,
  kind = 'settle',
  dir = 1,
  className,
  children,
}: {
  swapKey: string | number;
  kind?: 'settle' | 'slide';
  /** `slide` only: 1 when moving forward (the next round, the next hole), -1 when moving back. */
  dir?: 1 | -1;
  className?: string;
  children: ReactNode;
}) {
  const reduced = useChReducedMotion();
  return (
    <div className={'ch-swap' + (className ? ` ${className}` : '')}>
      <AnimatePresence mode="popLayout" initial={false} custom={dir}>
        <m.div
          key={swapKey}
          className="ch-swap__item"
          custom={dir}
          variants={reduced ? INSTANT : kind === 'slide' ? SLIDE : SETTLE}
          initial="enter"
          animate="shown"
          exit="leave"
        >
          <Leaving>{children}</Leaving>
        </m.div>
      </AnimatePresence>
    </div>
  );
}

/** The leaving copy keeps its pixels for the fade but drops out of the accessibility tree and focus order at once. */
function Leaving({ children }: { children: ReactNode }) {
  const present = useIsPresent();
  return (
    <div className="ch-swap__body" aria-hidden={present ? undefined : true} inert={!present}>
      {children}
    </div>
  );
}

const IN = { duration: CH_DUR.base, ease: CH_EASE };
const OUT = { duration: CH_DUR.quick, ease: CH_EASE };

const SETTLE = {
  enter: { opacity: 0, y: 6 },
  shown: { opacity: 1, y: 0, transition: IN },
  leave: { opacity: 0, y: -3, transition: OUT },
};

const SLIDE = {
  enter: (d: 1 | -1) => ({ opacity: 0, x: 12 * d }),
  shown: { opacity: 1, x: 0, transition: IN },
  leave: (d: 1 | -1) => ({ opacity: 0, x: -12 * d, transition: OUT }),
};

const INSTANT = {
  enter: { opacity: 1 },
  shown: { opacity: 1, transition: { duration: 0 } },
  leave: { opacity: 0, transition: { duration: 0 } },
};

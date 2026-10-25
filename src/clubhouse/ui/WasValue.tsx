'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { markKey } from '../lib/marks-cookie';
import { useMark } from '../lib/use-change-marks';

/**
 * The old value of a changed event, struck: "4:00" in the time column, "~~3:00 PM~~" under the title (P-14). The line is
 * a pseudo-element so it can draw (ui.css `.ch-was`): a mark this device has not seen starts `pending` and draws once with
 * a CSS animation, ending struck with no script; a seen one is `done` from the first frame and never moves. The shared
 * observer in use-change-marks.tsx only records that it was seen. Read aloud as "was 3:00 PM".
 */
export function WasValue({ changeId, children }: { changeId?: string | null; children: ReactNode }) {
  const mark = useMark(changeId);
  const ref = useRef<HTMLElement | null>(null);
  const { seen, watch } = mark;
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    return watch(el);
  }, [seen, watch]);
  return (
    <s ref={ref} className="ch-was" data-mark={changeId ? markKey(changeId) : undefined} data-draw={seen ? 'done' : 'pending'}>
      <span className="ch-sr-only">was </span>
      {children}
    </s>
  );
}

'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { markKey } from '../lib/marks-cookie';
import { useMark } from '../lib/use-change-marks';

/**
 * The old value of a changed event, struck: "4:00" in the time column, "~~3:00 PM~~" under the title (P-14). The line is
 * a pseudo-element (ui.css `.ch-was`), struck from the first frame (MOTION-AND-VISUAL 3.12: no first-paint draw-ins). The
 * shared observer in use-change-marks.tsx records that a mark this device has not seen was seen. Read aloud as "was 3:00 PM".
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
    <s ref={ref} className="ch-was" data-mark={changeId ? markKey(changeId) : undefined}>
      <span className="ch-sr-only">was </span>
      {children}
    </s>
  );
}

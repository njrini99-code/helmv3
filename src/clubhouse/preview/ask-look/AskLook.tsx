'use client';

import { useEffect, useRef } from 'react';
import '../../styles/coachhelm-ask-look.css';
import { Segmented } from '../../ui/Segmented';
import { useChPhone } from '../../lib/use-phone';
import { TurnA } from './a/TurnA';
import type { LookFrame } from './content';
import { Composer } from './parts';

const VIEWS = [
  { value: 'team', label: 'Team' },
  { value: 'ask', label: 'Ask' },
] as const;
const FRAMES: readonly LookFrame[] = ['work', 'answer', 'task', 'hold'];

/**
 * `coachhelm-ask-look?frame=work|answer|task|hold&long=1`: one turn of the chat in the yardage-book look, the one
 * direction kept (docs/clubhouse/coachhelm-chat-v3/LOOK.md). Static and fixture-driven: nothing loads, nothing is sent. `long` lets the
 * thread take its full height so one capture holds the whole turn.
 */
export function PreviewAskLook({ frame, long }: { frame?: string; long?: string }) {
  const phone = useChPhone();
  const f: LookFrame = FRAMES.find((x) => x === frame) ?? 'answer';
  // A short turn that ends in a card sits at the foot of the thread, as a chat that follows its newest message leaves it.
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const place = () => {
      el.scrollTop = f === 'task' || f === 'hold' ? el.scrollHeight : 0;
    };
    place();
    // Again once the thread has its final height (the webfont, a late layout).
    const seen = new ResizeObserver(place);
    if (el.firstElementChild) seen.observe(el.firstElementChild);
    return () => seen.disconnect();
  }, [f]);
  return (
    <main className={'ch-look ch-look--a' + (phone ? ' is-phone' : '')} data-frame={f} data-long={long ? '1' : undefined} aria-label="Ask CoachHelm">
      <div className="ch-look-top">
        <div className="ch-look-top__seg">
          <Segmented label="CoachHelm view" value="ask" options={VIEWS} onChange={() => {}} block={phone} />
        </div>
      </div>
      <div className="ch-look-scroll" ref={scroller}>
        <div className="ch-look-col">
          <TurnA frame={f} />
        </div>
      </div>
      <Composer working={f === 'work'} phone={phone} />
    </main>
  );
}

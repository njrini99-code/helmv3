'use client';

import { useRouter } from 'next/navigation';
import { useLayoutEffect, useRef, useState } from 'react';
import { useChPhone } from '../../lib/use-phone';
import { Segmented } from '../../ui/Segmented';

export type PracticeTab = 'plans' | 'drills' | 'groups' | 'templates';
const HREF: Record<PracticeTab, string> = { plans: '/golf/dashboard/practice', drills: '/golf/dashboard/practice/drills', groups: '/golf/dashboard/practice/groups', templates: '/golf/dashboard/practice/templates' };
/** The least room a label keeps on each side inside its tab (practice.css, `.ch-prc-tabs`). */
const SIDE = 8;

/** Whether the widest label fits a column when the tabs share one row equally. Zero or less of either is a row not laid out yet, which fits. */
export function tabsFitOneRow(widest: number, inner: number, gap: number, count: number): boolean {
  if (count < 1 || inner <= 0 || widest <= 0) return true;
  return widest + 2 * SIDE <= (inner - gap * (count - 1)) / count;
}

/**
 * Plans · Drills · Groups · Templates (N-00 4.1): each is a real address, so a tab survives a reload and Back. It fills a phone's width in
 * equal columns; on a Mac it hugs its labels at the page's left edge. Where a label would not fit its column (the largest Text Sizes, the
 * narrowest phones) the tabs take two rows of two: never clipped, never scrolled.
 */
export function PracticeTabs({ active }: { active: PracticeTab }) {
  const router = useRouter();
  const phone = useChPhone();
  const box = useRef<HTMLDivElement>(null);
  const [two, setTwo] = useState(false);
  useLayoutEffect(() => {
    const el = box.current;
    const well = el?.querySelector<HTMLElement>('.ch-seg');
    if (!el || !well || !phone) return setTwo(false);
    // A label is one line whatever the layout, so its width doesn't change when the rows do: the answer can't flip back and forth.
    const labels = [...well.querySelectorAll<HTMLElement>('.ch-seg__l')];
    const fit = () => {
      const cs = getComputedStyle(well);
      const inner = well.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
      const widest = Math.max(0, ...labels.map((l) => l.getBoundingClientRect().width));
      setTwo(!tabsFitOneRow(widest, inner, parseFloat(cs.columnGap) || 0, labels.length));
    };
    fit();
    if (typeof ResizeObserver === 'undefined') return;
    // The row's width (a turn of the phone) and a label's (Text Size, the web font landing).
    const watch = new ResizeObserver(fit);
    watch.observe(el);
    for (const l of labels) watch.observe(l);
    return () => watch.disconnect();
  }, [phone]);
  return (
    <div ref={box} className={'ch-prc-tabs' + (two ? ' is-two' : '')}>
      <Segmented<PracticeTab>
        label="Practice"
        block={phone}
        value={active}
        redraws
        options={[
          { value: 'plans', label: 'Plans' },
          { value: 'drills', label: 'Drills' },
          { value: 'groups', label: 'Groups' },
          { value: 'templates', label: 'Templates' },
        ]}
        onChange={(v) => router.push(HREF[v])}
      />
    </div>
  );
}

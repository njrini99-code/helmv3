'use client';

import { usePathname } from 'next/navigation';
import { useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CH_EASE, CH_FADE_MS, chSpringCurve } from '../../lib/motion';
import { useChMotionMode } from '../../lib/reduced-motion';
import { isLandingHome, useLandings, type LandingKind } from './landing';
import { QcCtx } from './qc-context';
import { BEAT_MS, SECOND_MS } from './qc-timing';

const ease = `cubic-bezier(${CH_EASE.join(',')})`;

/** Whole seconds left before a held write is saved, from the server's own instant; ticks on the second. */
function useSecondsLeft(until: string | null): number | null {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!until) return;
    const left = Date.parse(until) - Date.now();
    if (left <= 0) return;
    const t = setTimeout(() => tick((n) => n + 1), (left % SECOND_MS) + 8);
    return () => clearTimeout(t);
  });
  return until ? Math.max(0, Math.ceil((Date.parse(until) - Date.now()) / SECOND_MS)) : null;
}

/**
 * Where a row the chat is making will be (QUICK-CHAT.md `ST-8.pending`): a screen puts one where a new row of `kind`
 * would appear, and it draws nothing unless a write of that kind is held, or saved and not yet in the page, for this
 * page. A day-shaped screen passes the `day` its list is for, a one-player page the `subject` (that player's id). It is not the row: dashed, secondary ink, and it says
 * "Not saved yet".
 */
export function LandingSlot({ kind, day, subject, as: Tag = 'div' }: { kind: LandingKind; day?: string; subject?: string; as?: 'div' | 'li' }) {
  // The shell's pathname where the shell gives one (in a preview it is the screen's own, not the preview route's).
  const browser = usePathname() ?? '';
  const pathname = useContext(QcCtx)?.pathname ?? browser;
  const mode = useChMotionMode();
  const landing = useLandings().find((l) => l.kind === kind && l.phase !== 'landed' && isLandingHome(l, pathname) && (day === undefined || l.day === day) && (subject === undefined || l.subject === subject)) ?? null;
  const seconds = useSecondsLeft(landing?.phase === 'held' ? landing.heldUntil : null);
  const el = useRef<HTMLElement | null>(null);
  const key = landing?.key ?? null;
  const leaving = landing?.phase === 'undone' || landing?.phase === 'failed' || landing?.phase === 'late';
  // MO-8-1: one beat after the card's receipt, opacity and a 2% settle. MO-8-4: it leaves the way it came.
  useLayoutEffect(() => {
    const node = el.current;
    if (!node?.animate || !key || mode === 'off') return;
    if (mode === 'fade') {
      node.animate([{ opacity: 0 }, { opacity: 1 }], { duration: CH_FADE_MS, easing: 'linear' });
      return;
    }
    const settle = chSpringCurve('settle');
    node.animate([{ opacity: 0, transform: 'scale(0.98)' }, { opacity: 1, transform: 'none' }], { duration: settle.ms, easing: settle.linear, delay: BEAT_MS, fill: 'backwards' });
  }, [key, mode]);
  useLayoutEffect(() => {
    const node = el.current;
    if (!node?.animate || !leaving || mode === 'off') return;
    const from = getComputedStyle(node);
    node.getAnimations().forEach((a) => a.cancel());
    node.animate([{ opacity: from.opacity, transform: mode === 'fade' ? 'none' : from.transform }, { opacity: 0, transform: mode === 'fade' ? 'none' : 'scale(0.98)' }], { duration: CH_FADE_MS, easing: ease, fill: 'forwards' });
  }, [leaving, mode]);
  if (!landing) return null;
  const saved = landing.phase === 'saved';
  return (
    <Tag ref={el as never} className="ch-landslot" data-ch-slot={landing.key} data-phase={landing.phase}>
      <i className="ch-landslot__tint" aria-hidden="true" />
      <span className="ch-landslot__t">{landing.label}</span>
      <span className="ch-landslot__s">
        <span data-on={saved ? undefined : ''}>
          Not saved yet{seconds ? <> · saves in <span className="ch-num">{seconds}</span></> : null}
        </span>
        <span data-on={saved ? '' : undefined}>Saved</span>
      </span>
    </Tag>
  );
}

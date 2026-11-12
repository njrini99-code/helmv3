'use client';

import { ArrowUpRight } from 'lucide-react';
import type { ReactNode } from 'react';
import type { StudioKindName } from '@/lib/coachhelm/v3/chat/visuals/studio-kinds';
import { Icon } from '../../../../ui/Icon';
import type { StudioAsk } from './types';

/**
 * The two things an element of a studio component can do (CAPABILITIES.md, "The studio", tappable elements):
 *
 *   ask    the element itself is a key. A tap fills the composer with a question about it and sends nothing; the
 *          reference (the read and the element) rides on `data-ask-ref` and on the `StudioAsk` the caller receives.
 *   open   where the element is something the app has a screen for, a separate arrow at the row's end goes there.
 *          One row never does both with one target: the row asks, the arrow opens.
 *
 * Touch feedback: the pressed wash the app's rows use (`data-ch-pressed`, lib/press.ts), no scale on a row. A key that
 * cannot ask (no `onAsk`) is drawn as plain content, so nothing looks tappable where it is not.
 */

/** `kind:read:key`, the attribute the chat lead's askable affordance reads. */
export const askRef = (ask: Pick<StudioAsk, 'kind' | 'read' | 'key'>): string => `${ask.kind}:${ask.read ?? ''}:${ask.key}`;

/** The default `onAsk`: the composer's own fill event (Composer.tsx), which never sends. */
export function fillComposer(ask: StudioAsk): void {
  window.dispatchEvent(new CustomEvent('ch-ask-fill', { detail: ask.words }));
}

export interface AskTarget {
  kind: StudioKindName;
  read: string | null;
  onAsk?: (ask: StudioAsk) => void;
}

export function AskKey({ target, id, words, label, className, children }: { target: AskTarget; /** The element's key inside the part. */ id: string; /** What the composer is filled with. */ words: string; /** The key's name for a screen reader, when its content does not say it. */ label?: string; className?: string; children: ReactNode }) {
  const cls = 'ch-aks-ask' + (className ? ` ${className}` : '');
  if (!target.onAsk) return <span className={cls}>{children}</span>;
  const ask: StudioAsk = { kind: target.kind, read: target.read, key: id, words };
  const { onAsk } = target;
  return (
    <button type="button" className={cls + ' is-key ch-ak-askable'} data-ask-ref={askRef(ask)} data-ch-press="" aria-label={label} onClick={() => onAsk(ask)}>
      {children}
    </button>
  );
}

/** The way into the app from one element: an arrow at the row's end, its own 44px target, named for where it goes. */
export function OpenKey({ href, label }: { href: string | null | undefined; label: string }) {
  if (!href) return null;
  return (
    <a className="ch-aks-open" href={href} aria-label={label} data-ch-press="">
      <Icon icon={ArrowUpRight} size={16} />
    </a>
  );
}

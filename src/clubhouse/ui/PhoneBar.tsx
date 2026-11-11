'use client';

import { ChevronLeft, type LucideIcon } from 'lucide-react';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from './Icon';

/**
 * The phone top bar's parts (owner design, m-shell.jsx `MTop`; foundation.md):
 * a back link (chevron plus the parent's name), a title, and at most one
 * trailing action, an icon button or a text action. `PhoneBar` is the whole
 * bar for a pushed screen; the shell's top bar hosts the same parts for a
 * page's own top (`PhoneTop`).
 */
export interface ChPhoneBarParts {
  /**
   * The back link. `label` is the parent's name; leave it empty for a bare
   * chevron (a conversation). `chevron: false` makes it a plain text action
   * on the left ("Cancel").
   */
  back?: { label?: string; onBack: () => void; ariaLabel?: string; chevron?: boolean; /** A capture hook (`data-ch`). */ hook?: string } | null;
  title: ReactNode;
  /** Left-aligned title block (a conversation's avatar, name and subline) instead of a centred title. */
  lead?: boolean;
  /** The tab root's look: the title at the left, in the larger size, with no back link. */
  start?: boolean;
  action?: ReactNode;
  /** The title's id, for the screen's aria-labelledby. */
  titleId?: string;
  /**
   * `false`: the bar's title is plain text, not an h1, because the page draws its own h1 (one h1 per screen; P001 shared
   * finding). The default keeps the bar's title as the page's h1.
   */
  heading?: boolean;
}

/** The gap kept between the back link's words and the centred title. */
const BACK_GAP = 8;

/**
 * UINavigationBar's back title: the parent's name ("‹ Practice", "‹ CoachHelm", "‹ My stats") while it clears the
 * centred title, then "Back", then the chevron alone (MOB-SHELL-3). The room is measured to the title as drawn: it is
 * centred, as wide as its words up to 52% of the bar, so a short title leaves the parent's name its place. (It was
 * measured to a title assumed to fill its 52%, so on a phone only a five-letter parent ever showed.) The title's width
 * is its content's (`scrollWidth`), which holds while a large title keeps the bar's own title faded out.
 */
function BackLabel({ label, fits }: { label: string; fits: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [step, setStep] = useState<0 | 1 | 2>(0);
  useLayoutEffect(() => {
    const el = ref.current;
    const bar = el?.closest<HTMLElement>('.ch-pbar, .ch-topbar');
    if (!el || !fits || !bar || typeof ResizeObserver === 'undefined') return;
    const title = el.closest('button')?.parentElement?.querySelector<HTMLElement>(':scope > .ch-pbar__title:not(.is-start)') ?? null;
    const measure = () => {
      const width = bar.clientWidth;
      const titleWidth = title ? Math.min(title.scrollWidth, width * 0.52) : width * 0.52;
      const room = (width - titleWidth) / 2 - (el.getBoundingClientRect().left - bar.getBoundingClientRect().left) - BACK_GAP;
      const em = parseFloat(getComputedStyle(el).fontSize) || 17;
      // Character widths at about 0.55em: exact enough to choose a step, and the CSS ellipsis catches what's left.
      const wide = (t: string) => t.length * em * 0.55;
      setStep(room <= 0 || wide(label) <= room ? 0 : wide('Back') <= room ? 1 : 2);
    };
    measure();
    const seen = new ResizeObserver(measure);
    seen.observe(bar);
    if (title) seen.observe(title);
    return () => seen.disconnect();
  }, [label, fits]);
  return (
    <span ref={ref} aria-hidden="true">
      {step === 0 ? label : step === 1 ? 'Back' : ''}
    </span>
  );
}

/**
 * `heading: false` draws the title as plain text, not the page's h1: a page that has its own h1, and the shell's stand-in
 * for a page's own top while the page loads (CH-1402), which leaves the heading to the page.
 */
export function PhoneBarParts({ back, title, lead = false, start = false, action, titleId, heading = true }: ChPhoneBarParts) {
  const chevron = back?.chevron !== false;
  const Title = heading ? 'h1' : 'span';
  return (
    <>
      {back && (
        <button
          type="button"
          className={'ch-pbar__back' + (back.label ? '' : ' is-bare') + (chevron ? '' : ' is-text')}
          onClick={back.onBack}
          data-ch={back.hook}
          aria-label={back.ariaLabel ?? (!chevron ? back.label : back.label ? `Back to ${back.label}` : 'Back')}
        >
          {chevron && <Icon icon={ChevronLeft} size={20} />}
          {back.label && <BackLabel label={back.label} fits={chevron && !lead && !start} />}
        </button>
      )}
      {lead ? (
        <div className="ch-pbar__lead" id={titleId}>
          {title}
        </div>
      ) : (
        <Title className={'ch-pbar__title' + (start ? ' is-start' : '')} id={titleId} tabIndex={heading ? -1 : undefined}>
          {/* Plain words sit in their own box so a long name ends in an ellipsis: a bare text run in the flex title was
              cut off at the edge (H1). */}
          {typeof title === 'string' ? <span className="ch-pbar__tt">{title}</span> : title}
        </Title>
      )}
      <span className="ch-pbar__right">{action}</span>
    </>
  );
}

/**
 * The whole top bar of a pushed screen: the parts under the status bar, on the phone's green. Its row is 44px, as the
 * shell bar's, so the back link and a text action are full 44px keys (CH-1815).
 */
export function PhoneBar(props: ChPhoneBarParts) {
  return (
    <header className={'ch-pbar' + (props.lead ? ' is-lead' : '')}>
      <PhoneBarParts {...props} />
    </header>
  );
}

/** A 44px icon action in the top bar. */
export function PhoneIconAction({ icon, label, onClick, pressed }: { icon: LucideIcon; label: string; onClick: () => void; pressed?: boolean }) {
  return (
    <button type="button" className="ch-pbar__icon" aria-label={label} aria-pressed={pressed} onClick={onClick}>
      <Icon icon={icon} size={20} />
    </button>
  );
}

/** A text action in the top bar ("Next", "Create group", "Post"). Inert, in tertiary ink, while `disabled`. */
export function PhoneTextAction({ children, onClick, disabled, busy }: { children: ReactNode; onClick: () => void; disabled?: boolean; busy?: boolean }) {
  return (
    <button
      type="button"
      className="ch-pbar__text"
      onClick={() => !(disabled || busy) && onClick()}
      aria-disabled={disabled || busy || undefined}
      data-busy={busy || undefined}
    >
      {children}
    </button>
  );
}

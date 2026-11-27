'use client';

import Link from 'next/link';
import { createContext, useContext, type ReactNode } from 'react';
import { InSurface } from './Surface';

/**
 * The card kernel (design lab pilot P1, QUEUE dsx-02; design-lab/04-foundations-and-pilots.md and Nick's research report,
 * "premium cards are compositions, not rectangles"). One card, composed from named parts, so a page never redraws a title
 * bar, a figure or a footer in its own stylesheet:
 *
 *   <Card kind="metric" bar="green" onPress={open}>
 *     <CardHeader eyebrow="Lowest average" icon={<Icon icon={Trophy} size={15} />} />
 *     <CardMetric value="73.4" unit="season" delta={<DeltaChip … />} />
 *     <CardFooter>…</CardFooter>
 *   </Card>
 *
 * - `kind` says what the card is for (metric, entity, chart, comparison, alert, list) and sets its rhythm in card.css: a
 *   metric card leads with its figure, a chart card gives its visual the full width, a list card drops its body padding
 *   for rows. It is written to `data-card-role`, never to the ARIA role (hence not `role`).
 * - `tone` is the material: `paper` (the ivory card, `--ch-elevation-card`) or `feature` (the view's one deep green card,
 *   flat, at most one per view: DESIGN_LANGUAGE law 5; `featureCount` lets a test hold a screen to it).
 * - `bar="green"` is option F's title bar (look-09, Nick 21 Nov): the header becomes a deep green band with on-green
 *   inks. It is part of the card, so its corners, padding and inks come from one rule, not a negative margin per page.
 * - `onPress` or `href` makes the whole card one control, named by what it shows (MAC-09): a `<button>` or a link with the
 *   card's press scale (`data-ch-press-scale`, lib/press.ts) and the card's own focus ring. A pressable card holds no
 *   other control; `actions` on its header is refused in development.
 * - `state` is built in: `loading` draws the card's own skeleton shape (static, no shimmer, MOTION-AND-VISUAL 3.9) with
 *   `aria-busy`; `empty` and `failed` keep the header and put `message` where the body goes, so a card never collapses or
 *   changes height class between states.
 * - `as` draws a card that is not a control as an `li` or `article` (a template in a list) or a `div`; `hidden` takes a
 *   page's own skeleton card out of the reading order. A pressable card is always the button or the link.
 * - A card is never inside a card (SYS-3): it shares Surface's nesting guard.
 */
export type CardRole = 'metric' | 'entity' | 'chart' | 'comparison' | 'alert' | 'list';
export type CardState = 'ready' | 'loading' | 'empty' | 'failed';

const CardCtx = createContext<{ pressable: boolean; bar: boolean; tone: 'paper' | 'feature' }>({ pressable: false, bar: false, tone: 'paper' });

export function Card({
  as: Tag = 'section',
  kind = 'metric',
  tone = 'paper',
  bar,
  onPress,
  href,
  label,
  state = 'ready',
  message,
  className,
  ctl,
  'data-ctl': dataCtl,
  id,
  labelledBy,
  live,
  role,
  busy,
  code,
  hidden,
  children,
}: {
  /** The element a card that is not a control draws as. */
  as?: 'section' | 'article' | 'li' | 'div';
  kind?: CardRole;
  tone?: 'paper' | 'feature';
  /** Option F's green title bar on a paper card. A feature card is already green and takes none. */
  bar?: 'green';
  onPress?: () => void;
  href?: string;
  /** Only when the face cannot name the card (a chart alone): otherwise the card is named by what it shows. */
  label?: string;
  state?: CardState;
  /** What an empty or failed card says, in place of its body. */
  message?: ReactNode;
  className?: string;
  /** The control id (`CTL-P###-NNN`) when the card is pressable. */
  ctl?: string;
  /** The same id written as the controls ledger writes it on an element (`npm run clubhouse:controls`); `ctl` wins when both are set. */
  'data-ctl'?: string;
  /** The card's id, when a link or a scroll lands on it. */
  id?: string;
  /** The id of a heading inside the card that names it (a page's own heading), in place of `label`. */
  labelledBy?: string;
  /** A card whose content swaps in place (a picked hole) and is read out when it does. */
  live?: 'polite';
  /** A card that is itself the answer to a search or a filter ("No messages match"). */
  role?: 'status';
  /** A page's own loading card that keeps its loaded shape (not `state="loading"`, which draws the kernel's skeleton). */
  busy?: boolean;
  /** The page's state code (`CH-NNNNN`), written to `data-ch-code`. */
  code?: string;
  /** A page's own skeleton card, which no screen reader reads (`aria-hidden`). */
  hidden?: boolean;
  children?: ReactNode;
}) {
  const nested = useContext(InSurface);
  if (nested && process.env.NODE_ENV !== 'production') console.warn('Clubhouse: a Card inside a card. Use a CardSection or a row inside the outer card (SYS-3).');
  const pressable = !!(onPress || href) && state === 'ready';
  const greenBar = bar === 'green' && tone === 'paper';
  const attrs = {
    className: 'ch-card' + (className ? ` ${className}` : ''),
    'data-card-role': kind,
    'data-card-tone': tone,
    'data-card-bar': greenBar ? 'green' : undefined,
    'data-card-state': state === 'ready' ? undefined : state,
    id,
    'aria-labelledby': labelledBy,
    'aria-live': live,
    'aria-busy': busy || undefined,
    role,
    'data-ch-code': code,
    'aria-hidden': hidden || undefined,
  };
  const body =
    state === 'loading' ? (
      <CardSkeleton kind={kind} />
    ) : state === 'empty' || state === 'failed' ? (
      <>
        {headerOf(children)}
        <div className="ch-card__msg" role={state === 'failed' ? 'alert' : undefined}>
          {message}
        </div>
      </>
    ) : (
      children
    );
  const inner = (
    <CardCtx.Provider value={{ pressable, bar: greenBar, tone }}>
      <InSurface.Provider value={true}>{body}</InSurface.Provider>
    </CardCtx.Provider>
  );
  if (state === 'loading')
    return (
      <Tag {...attrs} aria-busy="true" aria-label={label ?? 'Loading'}>
        {inner}
      </Tag>
    );
  if (pressable && href)
    return (
      <Link {...attrs} data-ctl={ctl ?? dataCtl ?? 'CTL-P000-055'} href={href} aria-label={label} data-ch-press-scale=".97">
        {inner}
      </Link>
    );
  if (pressable)
    return (
      <button {...attrs} data-ctl={ctl ?? dataCtl ?? 'CTL-P000-056'} type="button" onClick={onPress} aria-label={label} data-ch-press-scale=".97">
        {inner}
      </button>
    );
  return (
    <Tag {...attrs} aria-label={label}>
      {inner}
    </Tag>
  );
}

/** The header kept by an empty or failed card, so its name stays where it was. */
function headerOf(children: ReactNode): ReactNode {
  const list = Array.isArray(children) ? children : [children];
  return list.find((c) => !!c && typeof c === 'object' && 'type' in c && c.type === CardHeader) ?? null;
}

/**
 * The header: an eyebrow (the card's name, small) or a title (a headline), a meta line, an icon, and actions on the right.
 * Under `bar="green"` it is the green band. A pressable card's header is text: its own spans, never a heading inside a
 * button, which a screen reader would read twice.
 */
export function CardHeader({
  eyebrow,
  title,
  meta,
  icon,
  actions,
  level = 3,
}: {
  eyebrow?: ReactNode;
  title?: ReactNode;
  meta?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  level?: 2 | 3;
}) {
  const { pressable } = useContext(CardCtx);
  if (pressable && actions && process.env.NODE_ENV !== 'production') console.warn('Clubhouse: a pressable Card holds no other control. Move the actions off the card or make the card a section.');
  const H = pressable ? 'span' : level === 2 ? 'h2' : 'h3';
  return (
    <div className="ch-card__head">
      <div className="ch-card__head-text">
        {eyebrow && <span className="ch-card__eyebrow">{eyebrow}</span>}
        {title && <H className="ch-card__title">{title}</H>}
        {meta && <span className="ch-card__meta">{meta}</span>}
      </div>
      {icon && (
        <span className="ch-card__icon" aria-hidden="true">
          {icon}
        </span>
      )}
      {actions && !pressable && <div className="ch-card__actions">{actions}</div>}
    </div>
  );
}

/**
 * The figure: one number in tabular figures with the true minus already applied by the caller's formatter, its unit or
 * window in the quiet tone beside it, and an optional delta (a `DeltaChip`, which never paints noise). `tone` colours the
 * number only for a real gain or loss; a plain figure stays in ink (option F: green and amber only with a benchmark).
 */
export function CardMetric({
  value,
  unit,
  delta,
  tone,
  size = 'card',
}: {
  value: ReactNode;
  unit?: ReactNode;
  delta?: ReactNode;
  tone?: 'gain' | 'loss';
  /** `hero` is the 44/56 hero figure, once per view; `card` (default) the card's 28 figure; `row` the 15/17 row figure. */
  size?: 'hero' | 'card' | 'row';
}) {
  return (
    <div className="ch-card__metric" data-size={size}>
      <span className={'ch-card__value ch-num' + (tone ? ` is-${tone}` : '')}>
        {value}
        {unit && (
          <>
            <span className="ch-sr-only"> </span>
            <span className="ch-card__unit">{unit}</span>
          </>
        )}
      </span>
      {delta && <span className="ch-card__delta">{delta}</span>}
    </div>
  );
}

/** The visual: a chart or a bar, full bleed inside the card's padding, its height kept by the chart. */
export function CardVisual({ children }: { children: ReactNode }) {
  return <div className="ch-card__visual">{children}</div>;
}

/** The body: prose, rows or anything else under the figure. */
export function CardBody({ children }: { children: ReactNode }) {
  return <div className="ch-card__body">{children}</div>;
}

/** The footer: the comparison or source on the left ("vs previous 10 rounds"), an action on the right. Hairline above. */
export function CardFooter({ children, action }: { children?: ReactNode; action?: ReactNode }) {
  const { pressable } = useContext(CardCtx);
  return (
    <div className="ch-card__foot">
      <span className="ch-card__note">{children}</span>
      {action && !pressable && <span className="ch-card__foot-act">{action}</span>}
    </div>
  );
}

/** The skeleton a loading card draws: its own parts' shapes, so the ready card lands without the page moving. */
function CardSkeleton({ kind }: { kind: CardRole }) {
  return (
    <div className="ch-card__skel" aria-hidden="true">
      <span className="ch-card__skel-line is-eyebrow" />
      {kind === 'chart' ? <span className="ch-card__skel-block" /> : <span className="ch-card__skel-line is-figure" />}
      <span className="ch-card__skel-line is-meta" />
    </div>
  );
}

/** How many feature cards a rendered view holds: DESIGN_LANGUAGE law 5 allows one. For tests and the preview gate. */
export function featureCount(root: ParentNode): number {
  return root.querySelectorAll('[data-card-tone="feature"], .ch-surface--feature').length;
}

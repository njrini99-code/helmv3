import { CircleAlert, ListFilter, Lock, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { EmptyShape, type EmptyShapeKind } from './EmptyShape';
import { Icon } from './Icon';
import { PageRetry } from './Retry';

/**
 * The honest states every Clubhouse surface needs, kept visually distinct:
 *   EmptyState   - the read worked and there is genuinely nothing yet; `tone="danger"` when the page's one read failed.
 *                  `shape` and `kind` opt in to the waiting form (below): four states that read differently
 *   InlineNotice - a part of the page could not load (./Notices, client); PageNotice when several parts did
 *   Skeleton     - the page is on its way (route loading only), with SkelLine, SkelRows and SkelRule
 * A failed read is never drawn as an empty state: it takes the danger tone, with Try again. This file is server-safe
 * so server components can pass icons into it.
 */

/**
 * A state's title is a headline, so it never ends in a full stop (states audit, 2026-10-08): one trailing period is
 * dropped as the title renders, wherever the words came from. An ellipsis keeps its dots, and a body keeps its
 * sentences' own.
 */
export function stateTitle(title: string): string {
  return title.endsWith('.') && !title.endsWith('..') ? title.slice(0, -1) : title;
}

/**
 * The four honest states, told apart on sight (the shaped form of EmptyState):
 *   first-run  - nothing has been made yet: the sentence names what fills the space and who does it, then the shape
 *   filtered   - there is data, a filter hides all of it: names the filter, and the one action is to clear it
 *   restricted - the viewer may not see or change this: a lock and who can, never an action that would fail
 *   error      - the read failed: `tone="danger"`, never drawn as empty
 */
export type EmptyKind = 'first-run' | 'filtered' | 'restricted';

const KIND_GLYPH: Record<EmptyKind, LucideIcon | undefined> = { 'first-run': undefined, filtered: ListFilter, restricted: Lock };

export function EmptyState({
  icon,
  title,
  body,
  action,
  secondaryAction,
  progress,
  compact = false,
  size = 'section',
  tone,
  code,
  shape,
  kind,
  shapeCount,
}: {
  icon?: LucideIcon;
  /** Shown without a trailing full stop (`stateTitle`). */
  title: string;
  body?: ReactNode;
  /** The one primary action. */
  action?: ReactNode;
  /** An optional second action, never more (v2). */
  secondaryAction?: ReactNode;
  /** Page size only: how far the space is from filling in, for example 2 of 5 rounds posted. */
  progress?: { done: number; total: number; label: string };
  compact?: boolean;
  /**
   * `section` for a part of a page: a line set flush on the Ledger, its glyph, title, sentence and action read left
   * to right from the section's edge. `page` when the whole page body is empty (the v2 empty state: a medallion, a
   * title that names what belongs, one or two sentences on how the space fills, one primary action).
   */
  size?: 'section' | 'page';
  /**
   * Page size only. `danger`: the page's one read failed, so nothing can show under its head (CH-1211). The route
   * error's anatomy (a brick medallion, CircleAlert unless `icon` is given), as an alert, with Try again first: it
   * re-runs the page's server render, or offline says so instead (CH-1905). `action` and `secondaryAction` follow it.
   */
  tone?: 'danger';
  /** Catalog number (docs/clubhouse/catalog). */
  code?: string;
  /**
   * Opt in to the waiting form: the shape of what will be here (ui/EmptyShape) under one sentence, the sentence in the
   * first row's place. Without it, and without `kind`, the state renders as it always has. A `compact` state stays one
   * line and draws no shape, so a dense section never grows.
   */
  shape?: EmptyShapeKind;
  /** Which honest state this is (see EmptyKind); passing it opts in to the waiting form. Default `first-run`. */
  kind?: EmptyKind;
  /** How many rows (or lanes) the shape draws, where its default is not the layout's. */
  shapeCount?: number;
}) {
  const heading = stateTitle(title);
  if ((shape || kind) && tone !== 'danger') {
    const state = kind ?? 'first-run';
    // The shape is the picture of a first run; a filter or a lock shows its own glyph instead (the caller's, or the kind's).
    const glyph = state === 'first-run' ? undefined : (icon ?? KIND_GLYPH[state]);
    const drawn = shape && state === 'first-run' && !compact;
    const Root = size === 'page' ? 'section' : 'div';
    const Title = size === 'page' ? 'h2' : 'p';
    return (
      <Root
        className={`ch-es ch-es--${size} ch-es--${state}${compact ? ' ch-es--line' : ''}${drawn ? ' ch-es--shaped' : ''}`}
        data-ch-code={code}
        data-ch-state={state}
      >
        <div className="ch-es__copy">
          {glyph && (
            <span className="ch-es__glyph" aria-hidden="true">
              <Icon icon={glyph} size={16} />
            </span>
          )}
          <div className="ch-es__text">
            <Title className="ch-es__title" role={state === 'filtered' ? 'status' : undefined}>
              {heading}
            </Title>
            {body && <p className="ch-es__body">{body}</p>}
            {progress && (
              <p className="ch-es__prog ch-num">
                {progress.done} of {progress.total} {progress.label}
              </p>
            )}
          </div>
          {(action || secondaryAction) && (
            <div className="ch-es__a">
              {action}
              {secondaryAction}
            </div>
          )}
        </div>
        {drawn && <EmptyShape kind={shape} count={shapeCount} />}
      </Root>
    );
  }
  if (size === 'page') {
    const danger = tone === 'danger';
    const glyph = icon ?? (danger ? CircleAlert : undefined);
    return (
      <section
        className={'ch-empty-page' + (danger ? ' ch-empty-page--danger' : '')}
        role={danger ? 'alert' : undefined}
        data-ch-code={code ?? (danger ? 'CH-1211' : undefined)}
      >
        <div className="ch-empty-page__in">
          {glyph && (
            <span className="ch-empty-page__art" aria-hidden="true">
              <span className="ch-empty-page__ic">
                <Icon icon={glyph} size={26} />
              </span>
            </span>
          )}
          <h2 className="ch-empty-page__title">{heading}</h2>
          {body && <p className="ch-empty-page__body">{body}</p>}
          {progress && (
            <div className="ch-empty-page__prog">
              <span className="ch-empty-page__seg" aria-hidden="true">
                {Array.from({ length: progress.total }, (_, i) => (
                  <i key={i} className={i < progress.done ? 'is-on' : undefined} />
                ))}
              </span>
              <span className="ch-empty-page__prog-t ch-num">
                {progress.done} of {progress.total} {progress.label}
              </span>
            </div>
          )}
          {danger ? (
            <PageRetry>
              {action}
              {secondaryAction}
            </PageRetry>
          ) : (
            (action || secondaryAction) && (
              <div className="ch-empty-page__a">
                {action}
                {secondaryAction}
              </div>
            )
          )}
        </div>
      </section>
    );
  }
  return (
    <div className={'ch-empty' + (icon ? ' ch-empty--icon' : '') + (compact ? ' ch-empty--compact' : '')} data-ch-code={code}>
      {icon && (
        <span className="ch-empty__icon" aria-hidden="true">
          <Icon icon={icon} size={16} />
        </span>
      )}
      <p className="ch-empty__title">{heading}</p>
      {body && <p className="ch-empty__body">{body}</p>}
      {(action || secondaryAction) && (
        <div className="ch-empty__action">
          {action}
          {secondaryAction}
        </div>
      )}
    </div>
  );
}

/** From this height a fluid placeholder stands for a block (a list, a panel, a hero), not a line of type or a control. */
const BLOCK_FROM = 56;

/**
 * CH-1609: a placeholder while the page is on its way; one shared shimmer, still when motion is off (shell.css). A bar
 * stands for a line of type or a control. A fluid placeholder 56px or taller stands for a block, and in the Ledger it
 * is drawn as the Ledger draws one: a rule along its top and two lines of type under it, never a filled card (states
 * audit, 2026-10-08). It keeps its box either way, so nothing moves when the page lands. `shape="solid"` keeps a real
 * object filled at any size (a scorecard, a chart, a portrait); `shape="block"` asks for the ruled block at any size.
 * `shape="feature"` is a green feature card in waiting (a hero), on the loaded card's own ground (F-0060).
 */
export function Skeleton({
  width,
  height = 12,
  radius = 6,
  shape,
}: {
  width?: number | string;
  height?: number;
  radius?: number;
  shape?: 'block' | 'solid' | 'feature';
}) {
  const block = shape === 'block' || (shape === undefined && height >= BLOCK_FROM && typeof width !== 'number');
  return <span className={shape === 'feature' ? 'ch-skel ch-skel--feature' : block ? 'ch-skel ch-skel--block' : 'ch-skel'} style={{ width, height, borderRadius: radius }} aria-hidden="true" />;
}

/**
 * One line of type in waiting: the line's own box at the text's line height, with its bar centred on it, so the line
 * does not move when the words land. `line` is the loaded line's height, `bar` the bar's (about the cap height).
 */
export function SkelLine({ line, bar, width }: { line: number; bar: number; width: number | string }) {
  return (
    <span className="ch-skel-ln" style={{ height: line }} aria-hidden="true">
      <Skeleton width={width} height={bar} />
    </span>
  );
}

/**
 * Rows in waiting on the Ledger's seams, in LedgerList's geometry (a 58px row, a soft rule between rows): a title bar
 * with a shorter line under it, and an optional lead (a time, a portrait) and trailing value. A list loads in place
 * as rows, never as a stack of cards.
 */
export function SkelRows({ rows = 4, lead = false, trail = false }: { rows?: number; lead?: boolean; trail?: boolean }) {
  return (
    <span className="ch-skel-rows" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <span key={i} className="ch-skel-rows__r">
          {lead && <Skeleton width={34} height={12} />}
          <span className="ch-skel-rows__t">
            <Skeleton width={`${58 - (i % 3) * 9}%`} height={13} />
            <Skeleton width={`${34 + (i % 2) * 10}%`} height={10} />
          </span>
          {trail && <Skeleton width={30} height={14} />}
        </span>
      ))}
    </span>
  );
}

/** The Ledger's rule in waiting, where the loaded page draws one: under a heading, between sections. */
export function SkelRule() {
  return <span className="ch-skel-rule" aria-hidden="true" />;
}

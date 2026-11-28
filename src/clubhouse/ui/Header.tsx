import type { ReactNode } from 'react';
import '../styles/header.css';
import { LargeTitle } from './LargeTitle';

/**
 * The one header system (dsx-08, design lab GAP-H1). Every head in Clubhouse is the same anatomy at one of three levels:
 *
 * - **page**: the page's opening. An eyebrow (whose, which season), the page's h1 (the phone's large title, the desk's
 *   framed title through `data-canopy-head`), one meta line, and the page's toolbar on the right.
 * - **section**: a heading inside a page (an h2 by default), one caption, and the section's own toolbar.
 * - **entity**: the head of one thing (a player, a round, an event): a leading mark (avatar, score), the eyebrow, the
 *   name, a meta line, a few key figures, and the toolbar for that thing.
 *
 * One anatomy, so one set of slot classes (`.ch-head__eyebrow`, `__title`, `__meta`, `__figs`, `__tools`) drawn from one
 * stylesheet (styles/header.css); a page's own sheet only places its head, it never re-draws a title or an eyebrow. The
 * toolbar is the contextual part: the actions that belong to what the head names, at most one of them primary, with
 * the rest folding into a More menu on the phone (`overflow`), and a selection mode that swaps the toolbar for the
 * selection's own actions while something is selected (`selection`). That part is `HeaderToolbar`
 * (ui/HeaderToolbar.tsx), the one client piece, so a head itself renders on the server.
 */

type Level = 'page' | 'section' | 'entity';
type Figure = { label: ReactNode; value: ReactNode; key?: string };

type HeadProps = {
  eyebrow?: ReactNode;
  title?: ReactNode;
  titleId?: string;
  /** One line under the title: a count, a window, a source, the person's role. */
  meta?: ReactNode;
  /** The head's actions: a `HeaderToolbar`, or one control. */
  toolbar?: ReactNode;
  /** Words for a terse title (a month without its year), as the heading's accessible name. */
  label?: string;
  className?: string;
  /** The catalog code this head carries (`data-ch-code`). */
  code?: string;
  /** Inside the text, under the meta line: a row of chips or a status that reads with the title. */
  detail?: ReactNode;
  /** Below the title block: the page's view switch or filter row, which belongs to the head. */
  children?: ReactNode;
};

/** Extra class names for a head's parts: how an older head (ui/Section's `.ch-sec__*`) keeps its own hooks. */
export type HeadSlots = { root?: string; text?: string; eyebrow?: string; title?: string; meta?: string; end?: string };

const cx = (...c: Array<string | false | undefined>) => c.filter(Boolean).join(' ');

function Shell({
  level,
  as: Tag = 'header',
  className,
  slots,
  code,
  canopy,
  canopyAlways = false,
  heading,
  eyebrow,
  meta,
  detail,
  metaAs: Meta = 'div',
  lead,
  figures,
  toolbar,
  children,
}: {
  level: Level;
  as?: 'header' | 'div';
  className?: string;
  slots?: HeadSlots;
  code?: string;
  canopy?: '' | 'tight';
  canopyAlways?: boolean;
  heading: ReactNode;
  eyebrow?: ReactNode;
  meta?: ReactNode;
  detail?: ReactNode;
  metaAs?: 'p' | 'div';
  lead?: ReactNode;
  figures?: readonly Figure[];
  toolbar?: ReactNode;
  children?: ReactNode;
}) {
  // One grid, not nested rows: the lead, the text and the toolbar share the first row; figures and anything the head
  // carries below (a view switch, a filter row) span the rows under it. So every level has the same parts in the
  // same places, and a page's sheet places the head, never re-draws it.
  return (
    <Tag className={cx('ch-head', `ch-head--${level}`, slots?.root, className)} data-canopy-head={canopy} data-canopy-tight-always={canopyAlways ? '' : undefined} data-ch-code={code}>
      {lead != null && <div className="ch-head__lead">{lead}</div>}
      <div className={cx('ch-head__text', slots?.text)}>
        {eyebrow != null && eyebrow !== false && <span className={cx('ch-head__eyebrow ch-num', slots?.eyebrow)}>{eyebrow}</span>}
        {heading}
        {meta != null && meta !== false && <Meta className={cx('ch-head__meta', slots?.meta)}>{meta}</Meta>}
        {detail}
      </div>
      {toolbar != null && toolbar !== false && <div className={cx('ch-head__end', slots?.end)}>{toolbar}</div>}
      {figures && figures.length > 0 && (
        <dl className="ch-head__figs">
          {figures.map((f, i) => (
            <div key={f.key ?? i} className="ch-head__fig">
              <dt>{f.label}</dt>
              <dd className="ch-num">{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {children != null && children !== false && <div className="ch-head__below">{children}</div>}
    </Tag>
  );
}

/**
 * A page's head. Its title is the page's h1: the phone's large title (ui/LargeTitle, which the top bar watches) and,
 * through `data-canopy-head`, the desk's framed title in the forest ink (styles/shell.css owns that one rule). `tight`
 * puts the title just under the bar for a page whose content is the point (a roster, a table). `level={2}` where the
 * phone's bar already holds the page's h1. `tight="always"` keeps it tight however wide the desk is. `large={false}` draws a
 * plain h1, for a desk head whose phone has its own.
 */
export function PageHeader({
  eyebrow,
  title,
  titleId,
  meta,
  detail,
  toolbar,
  label,
  className,
  code,
  children,
  slots,
  tight = false,
  large = true,
}: HeadProps & { tight?: boolean | 'always'; large?: boolean; slots?: HeadSlots }) {
  const heading = large ? (
    <LargeTitle id={titleId} className="ch-head__title">
      {label ? (
        <>
          <span aria-hidden="true">{title}</span>
          <span className="ch-sr-only">{label}</span>
        </>
      ) : (
        title
      )}
    </LargeTitle>
  ) : (
    <h1 id={titleId} className={cx('ch-head__title', slots?.title)} aria-label={label}>
      {title}
    </h1>
  );
  return (
    <Shell
      level="page"
      className={className}
      slots={slots}
      code={code}
      canopy={tight ? 'tight' : ''}
      canopyAlways={tight === 'always'}
      heading={heading}
      eyebrow={eyebrow}
      meta={meta}
      detail={detail}
      metaAs="p"
      toolbar={toolbar}
    >
      {children}
    </Shell>
  );
}

/** A section's head: an h2 (or h3 inside a section) with one caption and the section's own toolbar. */
export function SectionHeader({
  eyebrow,
  title,
  titleId,
  meta,
  toolbar,
  label,
  className,
  code,
  children,
  slots,
  level = 2,
}: HeadProps & { level?: 2 | 3; slots?: HeadSlots }) {
  const H = level === 3 ? 'h3' : 'h2';
  return (
    <Shell
      level="section"
      as="div"
      className={className}
      slots={slots}
      code={code}
      heading={
        title != null && title !== false ? (
          <H id={titleId} className={cx('ch-head__title', slots?.title)} aria-label={label}>
            {title}
          </H>
        ) : null
      }
      eyebrow={eyebrow}
      meta={meta}
      toolbar={toolbar}
    >
      {children}
    </Shell>
  );
}

/**
 * The head of one thing: a person, a round, an event. `lead` is its mark (an avatar, a score); `figures` are a few of
 * its key numbers, label over value, tabular. The name is the page's h1 unless `level={2}` (a sheet, a peek, a panel).
 */
export function EntityHeader({
  eyebrow,
  title,
  titleId,
  meta,
  toolbar,
  label,
  className,
  code,
  children,
  lead,
  figures,
  level = 1,
}: HeadProps & { lead?: ReactNode; figures?: readonly Figure[]; level?: 1 | 2 }) {
  const H = level === 2 ? 'h2' : 'h1';
  return (
    <Shell
      level="entity"
      className={className}
      code={code}
      canopy={level === 1 ? 'tight' : undefined}
      lead={lead}
      figures={figures}
      heading={
        <H id={titleId} className="ch-head__title" aria-label={label}>
          {title}
        </H>
      }
      eyebrow={eyebrow}
      meta={meta}
      toolbar={toolbar}
    >
      {children}
    </Shell>
  );
}

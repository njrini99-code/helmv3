'use client';

/**
 * ============================================================================
 * field-sheet-parts — the page-language pieces, shared across Fairway pages
 * ----------------------------------------------------------------------------
 * The generic anatomy every field-sheet page is built from (`LANGUAGE.md`):
 * the green section ruling, the masthead verdict, the ledger row and its
 * hairline rows, and a typeset readout.
 *
 * WHY THIS FILE EXISTS. These pieces were written twice, in
 * `pages/dashboard/coach-home-parts.tsx` and `pages/coachhelm/development-parts.tsx`,
 * with a note in the second saying whoever needed them third should extract
 * rather than write a fourth. Player home is the third. `development-parts`
 * now re-exports from here so its callers are unchanged; `coach-home-parts`
 * still has its own copy and can migrate whenever its owner wants to.
 *
 * Nothing screen-specific belongs here. A part that knows about focus areas,
 * rounds or goals stays in its own screen's parts file.
 * ========================================================================== */

import Link from 'next/link';
import { cn } from '@/lib/utils';
import { fwFocusRing, fwTransition } from '@/components/fairway/controls/_internal';

/** One clause of a masthead verdict; `href` makes it a link. */
export interface VerdictPart {
  text: string;
  href?: string;
}

/**
 * A section head: `h2` in `text-h3` over a 1px green rule. The rule is the
 * structure; there is no panel, no border and no fill behind it.
 */
export function SectionHead({
  children,
  action,
  id,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
  id?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={id} className="font-fw-display text-h3 font-semibold text-text-primary">
          {children}
        </h2>
        {action}
      </div>
      <div className="h-px w-full bg-accent-300" aria-hidden="true" />
    </div>
  );
}

/**
 * The masthead verdict: one honest sentence assembled from clauses, the names
 * and numbers among them as links.
 *
 * The clause array carries its OWN spacing. Do not insert a separator between
 * parts here: doing that printed "2 waiting on you ." with a space before the
 * period on the development screen.
 */
export function VerdictLine({
  parts,
  facts,
}: {
  parts: readonly VerdictPart[];
  facts?: React.ReactNode;
}) {
  if (parts.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <p className="max-w-[64ch] font-fw-display text-h3 font-normal leading-snug text-text-primary">
        {parts.map((part, i) => (
          <span key={`${part.text}-${i}`}>
            {part.href ? (
              <Link
                href={part.href}
                className="text-text-primary underline decoration-accent-300 decoration-[1.5px] underline-offset-[5px] hover:decoration-accent-500"
              >
                {part.text}
              </Link>
            ) : (
              part.text
            )}
          </span>
        ))}
      </p>
      {facts ? <p className="font-fw-sans text-caption text-text-tertiary">{facts}</p> : null}
    </div>
  );
}

/**
 * The ledger row: bare columns divided by vertical hairlines, never equal
 * cards. Only non-empty columns are passed in and the grid takes the shape of
 * however many arrive, so a reader with nothing in a column does not get an
 * empty third.
 *
 * The split is fractional (7/5, 5/4/3), so a narrow width costs every column
 * proportionally instead of starving one. Per the amended breakpoint rule the
 * split point is whatever width still holds every column's content whole, and
 * that is verified in captures rather than chosen by breakpoint name.
 */
const LEDGER_SPANS: Record<number, string[]> = {
  1: ['md:col-span-12'],
  2: ['md:col-span-7', 'md:col-span-5'],
};

export function LedgerRow({ columns }: { columns: readonly React.ReactNode[] }) {
  const present = columns.filter(Boolean);
  if (present.length === 0) return null;
  const spans = LEDGER_SPANS[present.length] ?? LEDGER_SPANS[2]!;
  return (
    <div
      data-slot="field-ledger"
      className="grid grid-cols-1 divide-y divide-border-subtle md:grid-cols-12 md:divide-x md:divide-y-0"
    >
      {present.map((column, i) => (
        <div
          key={i}
          className={cn(
            'flex min-w-0 flex-col gap-3 py-5 md:py-0',
            spans[i],
            // The hairlines are the division; the padding keeps content off
            // them. The first column has no left rule, so it needs no left pad.
            i > 0 ? 'md:pl-6' : '',
            i < present.length - 1 ? 'md:pr-6' : '',
          )}
        >
          {column}
        </div>
      ))}
    </div>
  );
}

/**
 * One hairline row inside a ledger column.
 *
 * NOTHING HERE TRUNCATES. A ledger column is a fraction of an already narrow
 * page, and `truncate` gives every row a hard minimum width equal to its
 * longest unbroken line: measured at 1440, a suggestion row wanted 262px of a
 * 92px cell and pushed 4px of horizontal overflow all the way up through its
 * page's shell. Wrapping holds the content whole at every width, which is what
 * the breakpoint rule actually asks for.
 *
 * `actions` sit on their OWN line, never beside the text. Two 44px buttons
 * plus a sentence do not share a fraction of a page at any width it renders
 * at, so there is no breakpoint at which the inline arrangement is correct.
 * `trailing` stays inline for a short figure, a percent or a word.
 */
export function LedgerRowItem({
  title,
  meta,
  trailing,
  actions,
  href,
  onClick,
}: {
  title: React.ReactNode;
  meta?: React.ReactNode;
  trailing?: React.ReactNode;
  actions?: React.ReactNode;
  href?: string;
  onClick?: () => void;
}) {
  const body = (
    <>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="font-fw-sans text-body-sm font-medium text-text-primary">{title}</span>
        {meta ? (
          <span className="font-fw-sans text-caption text-text-tertiary">{meta}</span>
        ) : null}
      </span>
      {trailing ? <span className="shrink-0">{trailing}</span> : null}
    </>
  );
  const shell = 'flex min-h-11 w-full items-center justify-between gap-3 text-left';
  const frame = 'border-b border-border-subtle py-2 last:border-b-0';

  if (actions) {
    return (
      <div className={cn('flex flex-col gap-2', frame)}>
        <div className={shell}>{body}</div>
        <div className="flex flex-wrap items-center gap-1">{actions}</div>
      </div>
    );
  }
  if (href) {
    return (
      <Link href={href} className={cn(shell, frame, fwTransition, 'hover:text-accent-700')}>
        {body}
      </Link>
    );
  }
  if (onClick) {
    return (
      // The hairline ROW is the tap target. <Button> brings its own
      // min-height, padding and hover fill, which would turn a ledger row
      // back into the tile this language bans.
      // eslint-disable-next-line helm/no-raw-button -- see above
      <button type="button" onClick={onClick} className={cn(shell, frame, fwFocusRing, fwTransition)}>
        {body}
      </button>
    );
  }
  return <div className={cn(shell, frame)}>{body}</div>;
}

/**
 * One readout: a number typeset as part of the page, not a tile. No panel, no
 * border and no fill behind the figure. Green and amber are ink on the numeral
 * itself, which is the only place the language spends them.
 */
export function FieldReadout({
  label,
  value,
  tone = 'neutral',
  sub,
}: {
  label: string;
  value: React.ReactNode;
  tone?: 'neutral' | 'good' | 'warn';
  /** A delta or a qualifier. Omitted entirely when there is nothing true to say. */
  sub?: React.ReactNode;
}) {
  const isZero = value === 0;
  return (
    <div className="flex flex-col gap-0.5">
      <span
        className={cn(
          'font-fw-mono text-h3 font-medium tabular-nums leading-none',
          // Zero is neither good news nor bad news.
          !isZero && tone === 'good' && 'text-accent-700',
          !isZero && tone === 'warn' && 'text-fw-warning-ink',
          (isZero || tone === 'neutral') && 'text-text-primary',
        )}
      >
        {value}
      </span>
      <span className="font-fw-sans text-eyebrow uppercase tracking-[0.07em] text-text-tertiary">
        {label}
      </span>
      {sub ? <span className="font-fw-sans text-caption text-text-tertiary">{sub}</span> : null}
    </div>
  );
}

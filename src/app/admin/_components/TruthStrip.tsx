import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { TruthCell } from '@/lib/admin/incidents/truth-strip';
import type { StateTone } from '@/lib/admin/incidents/types';

/**
 * The System Truth Strip — the fastest summary of the platform, and the first
 * thing under every Triage page header.
 *
 * WHAT MAKES IT DIFFERENT FROM A KPI ROW. A KPI tile shows a number. Each cell
 * here shows FOUR things — a value, the state word that qualifies it, how old
 * the evidence is, and which system it came from — because a number without
 * those is a claim about the present made from data of unknown vintage. That
 * is not a hypothetical failure: the Bridge rendered a three-hour-old
 * collector reading and a live Sentry pull as equally current, and an operator
 * has no way to tell which one they are looking at.
 *
 * The freshness line is therefore NEVER omitted. A cell whose age is genuinely
 * unknown prints "age unknown" — a blank reads as "current", which is the one
 * thing it must not say.
 *
 * COLOUR IS NEVER THE ONLY SIGNAL. Every cell carries its state as a word next
 * to the colour, so the strip is readable in greyscale, by a screen reader, and
 * by anyone who does not already know the palette.
 *
 * ON A PHONE it is a horizontal snap rail rather than a 5-column grid, and the
 * rail scrolls inside its own container so the PAGE never pans sideways.
 */

const TONE_RAIL: Readonly<Record<StateTone, string>> = {
  // Rails take the saturated token; text takes the `-ink` pairing. The
  // semantic colours measured as text fail contrast (warning 2.08:1,
  // danger 4.01:1) — see the header of `Row.tsx`.
  danger: 'bg-fw-danger',
  warning: 'bg-fw-warning',
  success: 'bg-fw-success',
  accent: 'bg-accent-600',
  neutral: 'bg-warm-300',
};

const TONE_INK: Readonly<Record<StateTone, string>> = {
  danger: 'text-fw-danger-ink',
  warning: 'text-fw-warning-ink',
  success: 'text-fw-success-ink',
  accent: 'text-accent-700',
  neutral: 'text-warm-500',
};

function CellBody({ cell }: { cell: TruthCell }) {
  return (
    <>
      <span
        aria-hidden
        className={cn('absolute inset-x-0 top-0 h-0.5 rounded-b-sm', TONE_RAIL[cell.tone])}
      />
      <p className="text-eyebrow uppercase tracking-widest text-warm-500">{cell.label}</p>
      <p className="mt-1 break-words font-fw-mono text-body-sm font-semibold leading-snug text-warm-900 [overflow-wrap:anywhere]">
        {cell.value}
      </p>
      {/* The state WORD, always — never colour alone. */}
      <p className={cn('mt-0.5 text-eyebrow uppercase tracking-wide', TONE_INK[cell.tone])}>
        {cell.state}
      </p>
      <p className="mt-1 font-fw-mono text-caption tabular-nums text-warm-400">{cell.freshness}</p>
      <p className="truncate font-fw-mono text-caption text-warm-400" title={cell.source}>
        {cell.source}
      </p>
    </>
  );
}

/**
 * `min-h-[5.5rem]` and the generous padding are the 44px tap-target rule
 * applied to a whole cell: the cell IS the control, so it has to be
 * comfortably hittable with a thumb rather than relying on a small link
 * inside it.
 */
const CELL_CLASS =
  'relative flex min-h-[5.5rem] w-[9.5rem] shrink-0 snap-start flex-col rounded-xl bg-surface-sunken px-3 pb-2.5 pt-3 sm:w-auto';

export function TruthStrip({ cells }: { cells: readonly TruthCell[] }) {
  return (
    <section aria-label="System truth" className="mt-3">
      <ul className="flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1 sm:grid sm:grid-cols-3 sm:overflow-visible lg:grid-cols-5">
        {cells.map((cell) => (
          <li key={cell.id} className="contents">
            {cell.href ? (
              <Link
                href={cell.href}
                title={cell.detail}
                className={cn(
                  CELL_CLASS,
                  'transition-colors hover:bg-warm-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500',
                )}
              >
                <CellBody cell={cell} />
                {/* The detail reaches assistive tech even though it is a
                    hover title visually — a hover-only explanation is not an
                    explanation on a phone. */}
                <span className="sr-only">{cell.detail}</span>
              </Link>
            ) : (
              <div className={CELL_CLASS} title={cell.detail}>
                <CellBody cell={cell} />
                <span className="sr-only">{cell.detail}</span>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The same five facts as a single sentence, for surfaces too narrow for the
 * strip and for assistive tech that would rather read one line than five
 * cards.
 */
export function TruthStripSummary({ cells }: { cells: readonly TruthCell[] }) {
  return (
    <p className="sr-only">
      {cells.map((c) => `${c.label}: ${c.value}, ${c.state}, ${c.freshness}.`).join(' ')}
    </p>
  );
}

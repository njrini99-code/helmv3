import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * The Bridge's row language, in one place.
 *
 * WHY THIS EXISTS. Every tab hand-rolled its own row: Reliability carried 7
 * StatusPills and 3 bespoke `<li>`s, Jobs carried 12, Health rolled its own
 * markup with neither. So each tab drifted independently, and restyling them
 * one at a time would only reset the drift clock. These are the pieces the
 * errors queue was rebuilt from — extracted so a tab ADOPTS the language
 * rather than re-implementing it.
 *
 * The rules the pieces encode, learned rebuilding the incident card:
 *
 *   ONE ANCHOR PER ROW. A list is scanned, not read. The title is the only
 *   thing at full weight; everything else is subordinate.
 *
 *   COLOUR MEANS SEVERITY. Nothing else gets a hue. Ten chips of equal weight
 *   is not hierarchy, it is confetti — the previous incident card proved it.
 *
 *   SATURATED FOR RAILS, `-ink` FOR TEXT. design-tokens.css measured the
 *   semantic colours as text and they fail: warning 2.08:1, danger 4.01:1.
 *   The `-ink` pairings are 7.27:1. A rail is a block of colour, not text, so
 *   it takes the full value; anything readable takes the ink.
 */

export type RowSeverity = 'critical' | 'error' | 'warning' | 'info' | 'ok';

/** Rails: the saturated semantic token. Never used for text. */
const RAIL: Record<RowSeverity, string> = {
  critical: 'bg-fw-danger',
  error: 'bg-fw-danger',
  warning: 'bg-fw-warning',
  info: 'bg-warm-300',
  ok: 'bg-fw-success',
};

/** Text: the `-ink` pairing, which is the one that actually reads. */
export const SEVERITY_INK: Record<RowSeverity, string> = {
  critical: 'text-fw-danger-ink',
  error: 'text-fw-danger-ink',
  warning: 'text-fw-warning-ink',
  info: 'text-warm-500',
  ok: 'text-fw-success-ink',
};

/**
 * A row with a severity rail down its left edge.
 *
 * The rail replaced a leading severity PILL, which led every row and told you
 * the least — nearly every row in an error queue is error or warning — while
 * costing a full line of height. As a rail it costs none, and a screenful
 * becomes a readable column of severity.
 *
 * Severity also reaches assistive tech as a word: colour is never the only
 * channel carrying it.
 */
export function RailRow({
  severity,
  children,
  className,
  as: Tag = 'li',
}: {
  severity: RowSeverity;
  children: ReactNode;
  className?: string;
  as?: 'li' | 'div';
}) {
  return (
    <Tag className={cn('relative flex min-w-0 gap-2.5 py-2.5 pr-3', className)}>
      <span aria-hidden className={cn('absolute inset-y-1.5 left-0 w-1 rounded-r-sm', RAIL[severity])} />
      <span className="sr-only">{severity}</span>
      <div className="min-w-0 flex-1 pl-3">{children}</div>
    </Tag>
  );
}

/**
 * Title on the left, one number on the right.
 *
 * The count used to sit mid-sentence inside a run-on metadata line, where it
 * was unreadable. Right-aligned and tabular, a column of them scans vertically
 * — which is the only way a count is useful in a list.
 */
export function RowHead({
  children,
  value,
  valueLabel,
  clamp = 2,
}: {
  children: ReactNode;
  value?: ReactNode;
  /** What the number counts, e.g. "3 events" — announced, not drawn. */
  valueLabel?: string;
  clamp?: 1 | 2 | 3;
}) {
  return (
    <div className="flex items-baseline gap-2.5">
      <div
        className={cn(
          'min-w-0 flex-1 break-words text-body-sm font-semibold leading-snug text-warm-900 [overflow-wrap:anywhere]',
          clamp === 1 && 'line-clamp-1',
          clamp === 2 && 'line-clamp-2',
          clamp === 3 && 'line-clamp-3',
        )}
      >
        {children}
      </div>
      {value !== undefined ? (
        // A bare number is right for scanning — a column of them reads
        // vertically — but it must still announce what it counts, so the unit
        // travels as an accessible label rather than as visible chrome.
        <span
          className="shrink-0 font-fw-mono text-caption font-semibold tabular-nums text-warm-600"
          title={valueLabel}
          aria-label={valueLabel}
        >
          {value}
        </span>
      ) : null}
    </div>
  );
}

/**
 * The quiet mono line of facts, middot-separated.
 *
 * This replaced a strip of chips. Chips are for STATE — regressed, suppressed,
 * message lost — where the reader needs to notice something. Using them for
 * every attribute gave feature, action, source, sport and origin the same
 * visual weight as severity, so nothing led. As text they read in the order
 * the questions are actually asked, and cost one line.
 *
 * Empty and null entries are dropped, so a caller can pass optional fields
 * positionally without assembling the array itself.
 */
export function FactLine({
  items,
  emphasizeFirst = false,
  className,
}: {
  items: ReadonlyArray<string | null | undefined>;
  /** Give the first fact secondary-text weight — used where it is an error
   *  code, which is the most identifying thing a row carries. */
  emphasizeFirst?: boolean;
  className?: string;
}) {
  const facts = items.filter((f): f is string => typeof f === 'string' && f.trim().length > 0);
  if (facts.length === 0) return null;
  return (
    <p
      className={cn(
        'mt-0.5 break-words font-fw-mono text-caption leading-5 text-warm-500 [overflow-wrap:anywhere]',
        className,
      )}
    >
      {facts.map((f, i) => (
        <span key={`${f}-${i}`}>
          {i > 0 ? <span className="px-0.5 text-warm-400">·</span> : null}
          <span className={i === 0 && emphasizeFirst ? 'text-warm-600' : undefined}>{f}</span>
        </span>
      ))}
    </p>
  );
}

/** The dimmest line — a path, an id, anything you read only when you care. */
export function RowPath({ children }: { children: ReactNode }) {
  return <p className="break-all font-fw-mono text-caption leading-5 text-warm-400">{children}</p>;
}

/**
 * The bottom line: quiet context on the left, controls pushed right.
 *
 * Counts of users and a timestamp QUALIFY the headline number rather than
 * competing with it, so they sit here at the lowest weight on the row.
 */
export function RowFoot({ meta, children }: { meta?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mt-1.5 flex items-center gap-2">
      {meta ? <span className="font-fw-mono text-caption tabular-nums text-warm-400">{meta}</span> : null}
      {children ? <span className="ml-auto flex shrink-0 items-center gap-1">{children}</span> : null}
    </div>
  );
}

/**
 * A STATE chip — and only state.
 *
 * `neutral` for a classification, `danger` for something that should stop you,
 * `accent` for the one affordance worth interrupting a scan for. If you are
 * reaching for a chip to display an attribute, use FactLine instead.
 */
export function StateChip({
  tone = 'neutral',
  title,
  children,
}: {
  tone?: 'neutral' | 'danger' | 'warning' | 'accent';
  title?: string;
  children: ReactNode;
}) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-eyebrow uppercase leading-4',
        tone === 'neutral' && 'bg-warm-100 text-warm-600',
        tone === 'danger' && 'bg-fw-danger-bg text-fw-danger-ink',
        tone === 'warning' && 'bg-fw-warning-bg text-fw-warning-ink',
        tone === 'accent' && 'bg-accent-600/15 text-accent-700',
      )}
    >
      {children}
    </span>
  );
}

/**
 * A section heading inside a list — the severity bands in the triage queue,
 * and the equivalent grouping on any other tab.
 *
 * Carries the severity INK, not the rail colour, because this one IS text.
 * Empty groups never render a heading: an always-present "Critical 0" band is
 * the chrome that made the queue hard to read in the first place.
 */
export function GroupHeading({
  label,
  count,
  severity,
}: {
  label: string;
  count?: number;
  severity?: RowSeverity;
}) {
  return (
    <h3 className="sticky top-0 z-10 flex items-baseline gap-2 bg-warm-50/95 py-1.5 text-eyebrow uppercase tracking-widest backdrop-blur">
      <span className={cn('font-bold', severity ? SEVERITY_INK[severity] : 'text-warm-500')}>{label}</span>
      {count !== undefined ? <span className="font-fw-mono tabular-nums text-warm-400">{count}</span> : null}
    </h3>
  );
}

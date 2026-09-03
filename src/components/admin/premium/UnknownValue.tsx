import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * ============================================================================
 * Bridge Premium · UnknownValue
 * ----------------------------------------------------------------------------
 * The shared "unknown" treatment (brief §4 visual vocabulary: "hatched
 * segment = unknown because evidence could not be read"; §44 "unknown never
 * rendered as zero"). Every other premium primitive in this directory routes
 * its own not-read/not-attempted states through this component rather than
 * inventing a second muted style — a source that could not be read must look
 * the same everywhere in Bridge, or an operator learns to distrust whichever
 * one they saw first.
 *
 * Deliberately NOT a `StatusPill` variant: a pill claims a state ("this IS
 * warning", "this IS danger"); this claims the ABSENCE of a claim — visually
 * distinct (dashed border, hatched fill, muted ink, no dot) so it can never
 * be mistaken for a real severity at a glance. Text is never optional: the
 * hatch pattern alone would fail everyone relying on it, so `label` always
 * renders as text.
 * ========================================================================== */

export interface UnknownValueProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  /** What to say instead of a value. Defaults to "Unknown" — never blank,
   *  never "0", never "—" alone. Ignored when `children` is given. */
  label?: string;
  /** Richer content than a plain string (e.g. an icon plus a word). When
   *  omitted, `label` renders instead — most callers only need the string
   *  form. */
  children?: ReactNode;
  /** Why this could not be read, when known — becomes the `title` tooltip so
   *  the reason is one hover away without cluttering the inline text. */
  reason?: string | null;
  /** `sm` for inline use inside a dense row; `md` for a standalone chip. */
  size?: 'sm' | 'md';
}

const SIZE_CLASS: Readonly<Record<'sm' | 'md', string>> = {
  sm: 'h-5 px-1.5 text-eyebrow gap-1',
  md: 'h-6 px-2 text-caption gap-1.5',
};

/** A faint diagonal hatch, warm-toned, low-contrast enough to read as texture
 *  rather than as a chart — the "hatched segment" from the vocabulary,
 *  rendered as a background instead of a filled/hollow dot because this
 *  component is text-first, not a status dot. */
const HATCH_BACKGROUND =
  'repeating-linear-gradient(135deg, var(--fw-color-warm-200) 0px, var(--fw-color-warm-200) 1px, transparent 1px, transparent 6px)';

export function UnknownValue({
  label = 'Unknown',
  children,
  reason = null,
  size = 'md',
  className,
  ...props
}: UnknownValueProps) {
  return (
    <span
      data-slot="bridge-unknown-value"
      title={reason ?? undefined}
      className={cn(
        'inline-flex items-center rounded-full border border-dashed border-warm-300 font-fw-sans text-warm-500',
        'whitespace-nowrap align-middle',
        SIZE_CLASS[size],
        className,
      )}
      style={{ backgroundImage: HATCH_BACKGROUND }}
      {...props}
    >
      {children ?? label}
    </span>
  );
}

/**
 * Inline text-only variant for use inside a sentence or a table cell where a
 * pill shape would be visual noise — same rule (never blank, never a bare
 * dash with no explanation), rendered as plain muted italic text instead.
 */
export function UnknownInline({ label = 'unknown', reason = null }: { label?: string; reason?: string | null }) {
  return (
    <span data-slot="bridge-unknown-inline" title={reason ?? undefined} className="italic text-warm-500">
      {label}
    </span>
  );
}

import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { IdStatus } from '@/lib/admin/clubhouse/graph';
import {
  CATEGORIES,
  categoryCode,
  categoryFamily,
  categoryName,
  gateTone,
  gateWords,
  type CategoryFamily,
  type GateTone,
} from '@/lib/admin/clubhouse/screens';

/**
 * The Bridge's shared marks (plan §7.4): the category legend, and the page, ID, action and control chips that are one
 * click to their dossier, drawn the same way on every Clubhouse screen. Fairway tokens only; never Clubhouse's
 * `--ch-*` (plan §16).
 */

/** One colour per family; the two-digit number on the mark carries the exact category. */
const FAMILY_MARK: Record<CategoryFamily, string> = {
  failure: 'bg-fw-danger border-fw-danger',
  success: 'bg-fw-success border-fw-success',
  caution: 'bg-fw-warning border-fw-warning',
  core: 'bg-text-primary border-text-primary',
  flow: 'bg-text-tertiary border-text-tertiary',
  experience: 'bg-transparent border-text-secondary',
  record: 'bg-border-strong border-border-strong',
};

const FAMILY_WORDS: Record<CategoryFamily, string> = {
  core: 'Core and empty',
  flow: 'Loading, sync, recovery',
  caution: 'Validation and warning',
  failure: 'Failure',
  success: 'Success',
  experience: 'Motion, haptics, a11y, layout',
  record: 'Logging, tests, Bridge',
};

export function CategoryDot({ category, className }: { category: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('inline-block h-2.5 w-2.5 shrink-0 rounded-full border-2', FAMILY_MARK[categoryFamily(category)], className)}
    />
  );
}

/** `06 Server / system error` with its legend dot. */
export function CategoryTag({ category, short = false }: { category: number; short?: boolean }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-caption text-text-secondary">
      <CategoryDot category={category} />
      <span className="font-fw-mono tabular-nums text-text-primary">{categoryCode(category)}</span>
      {short ? <span className="sr-only">{categoryName(category)}</span> : <span className="truncate">{categoryName(category)}</span>}
    </span>
  );
}

/** The 25 categories, grouped by family, folded by default: the dots repeat on every screen, so the key is one tap away. */
export function CategoryLegend({ answered }: { answered?: ReadonlySet<number> }) {
  const families = [...new Set(CATEGORIES.map(categoryFamily))];
  return (
    <details className="group/legend min-w-0 rounded-fw-md border border-border-subtle bg-surface px-3 py-2">
      <summary className="flex min-h-9 cursor-pointer list-none items-center gap-2 text-caption font-medium text-text-secondary [&::-webkit-details-marker]:hidden [@media(pointer:coarse)]:min-h-11">
        <span className="flex items-center gap-1" aria-hidden>
          {families.map((family) => (
            <span key={family} className={cn('inline-block h-2.5 w-2.5 rounded-full border-2', FAMILY_MARK[family])} />
          ))}
        </span>
        Category legend
        {answered ? (
          <span className="font-fw-mono tabular-nums text-text-tertiary">
            {answered.size}/25 answered
          </span>
        ) : null}
      </summary>
      <div className="mt-2 grid gap-x-6 gap-y-3 pb-1 sm:grid-cols-2 lg:grid-cols-3">
        {families.map((family) => (
          <div key={family} className="min-w-0">
            <p className="mb-1 text-caption font-semibold uppercase tracking-wide text-text-tertiary">{FAMILY_WORDS[family]}</p>
            <ul className="space-y-0.5">
              {CATEGORIES.filter((c) => categoryFamily(c) === family).map((c) => (
                <li key={c} className={cn(answered && !answered.has(c) && 'text-text-tertiary')}>
                  <CategoryTag category={c} />
                  {answered && !answered.has(c) ? <span className="ml-1.5 text-caption text-text-tertiary">none</span> : null}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </details>
  );
}

const chipBase =
  'inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-full border px-2 py-0.5 font-fw-mono text-caption tabular-nums transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500 [@media(pointer:coarse)]:min-h-9';

function ChipLink({
  href,
  br,
  className,
  title,
  children,
}: {
  href: string;
  br: string;
  className?: string;
  title?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} data-br={br} title={title} className={cn(chipBase, className)}>
      {children}
    </Link>
  );
}

/** `P011 Rounds` → the page dossier. */
export function PageChip({ id, name, href, br }: { id: string; name?: string; href: string; br: string }) {
  return (
    <ChipLink href={href} br={br} className="border-border-subtle bg-surface-sunken text-text-primary hover:border-border-strong">
      <span className="font-semibold">{id}</span>
      {name ? <span className="truncate font-fw-sans text-text-secondary">{name}</span> : null}
    </ChipLink>
  );
}

/** `70603 · CH-7004` → the code dossier, marked with its category. */
export function IdChip({
  id,
  ch,
  category,
  status,
  href,
  br,
  title,
}: {
  id: number | string;
  ch?: string;
  category?: number;
  status?: IdStatus;
  href: string;
  br: string;
  title?: string;
}) {
  return (
    <ChipLink
      href={href}
      br={br}
      title={title}
      className={cn(
        'border-border-subtle bg-surface text-text-primary hover:border-border-strong',
        status === 'reserved' && 'border-dashed',
        status === 'deprecated' && 'text-text-tertiary line-through',
      )}
    >
      {category ? <CategoryDot category={category} /> : null}
      <span>{id}</span>
      {ch ? <span className="text-text-tertiary">· {ch}</span> : null}
    </ChipLink>
  );
}

/** `ACT-P007-SEND-MESSAGE` → the action dossier. */
export function ActionChip({ id, href, br, label }: { id: string; href: string; br: string; label?: string }) {
  return (
    <ChipLink href={href} br={br} title={label} className="border-accent-200 bg-accent-50 text-accent-ink hover:border-accent-300">
      <span className="truncate">{id}</span>
    </ChipLink>
  );
}

/** `CTL-P007-014` → the control dossier. */
export function ControlChip({ id, href, br }: { id: string; href: string; br: string }) {
  return (
    <ChipLink href={href} br={br} className="border-border-subtle bg-surface-sunken text-text-primary hover:border-border-strong">
      <span className="truncate">{id}</span>
    </ChipLink>
  );
}

const STATUS_CLASS: Record<IdStatus, string> = {
  implemented: 'border-border-subtle bg-surface-sunken text-text-secondary',
  reserved: 'border-dashed border-border-strong bg-transparent text-text-secondary',
  deprecated: 'border-border-subtle bg-transparent text-text-tertiary line-through',
};

export function StatusTag({ status }: { status: IdStatus }) {
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-caption', STATUS_CLASS[status])}>
      {status}
    </span>
  );
}

const GATE_CLASS: Record<GateTone, string> = {
  met: 'border-accent-200 bg-fw-success-bg text-accent-ink',
  partial: 'border-fw-warning-ring bg-fw-warning-bg text-fw-warning-ink',
  open: 'border-fw-danger/25 bg-fw-danger-bg text-fw-danger-ink',
  unknown: 'border-border-subtle bg-surface-sunken text-text-tertiary',
};

const GATE_GLYPH: Record<GateTone, string> = { met: '●', partial: '◐', open: '○', unknown: '–' };

/** One manifest gate: a glyph that reads without colour, and the value in words beside it or in its title. */
export function GateMark({ gate, value, compact = false }: { gate: string; value: string | undefined; compact?: boolean }) {
  const tone = gateTone(value);
  return (
    <span
      title={`${gate}: ${gateWords(value)}`}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-caption',
        GATE_CLASS[tone],
      )}
    >
      <span aria-hidden>{GATE_GLYPH[tone]}</span>
      {compact ? <span className="sr-only">{`${gate}: ${gateWords(value)}`}</span> : <span>{gateWords(value)}</span>}
    </span>
  );
}

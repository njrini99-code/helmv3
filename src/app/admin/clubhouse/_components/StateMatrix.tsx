import Link from 'next/link';
import { cn } from '@/lib/utils';
import { BR } from '@/lib/admin/clubhouse/br-codes';
import {
  categoryCode,
  categoryName,
  clubhouseHref,
  withScope,
  type ClubhouseScope,
  type MatrixRow,
} from '@/lib/admin/clubhouse/screens';
import { CategoryDot } from './chips';

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * B02's centrepiece (plan §8): one row per category, one cell per Bridge ID. The outline is the status (solid
 * implemented, dashed reserved, struck deprecated). Fill would be how often it fired and a red corner a failure; both
 * need signals, so every cell is drawn unfilled and the legend says so. Hover (or focus) gives the meaning and the
 * exact words the coach sees.
 */
export function StateMatrix({
  rows,
  pagePath,
  scope,
  view,
  activeCategory,
}: {
  rows: MatrixRow[];
  pagePath: string;
  scope: ClubhouseScope;
  view: string;
  activeCategory: number | null;
}) {
  return (
    <div className="min-w-0 space-y-2">
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-caption text-text-secondary" aria-label="Matrix key">
        <li className="inline-flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-3.5 w-3.5 rounded-sm border border-border-strong bg-surface" />
          implemented
        </li>
        <li className="inline-flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-3.5 w-3.5 rounded-sm border border-dashed border-border-strong" />
          reserved
        </li>
        <li className="inline-flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-3.5 w-3.5 rounded-sm border border-border-subtle bg-surface-sunken" />
          deprecated
        </li>
        <li className="text-text-tertiary">Fill (how often it fired) waits for signals.</li>
      </ul>
      <div className="divide-y divide-border-subtle rounded-fw-md border border-border-subtle bg-surface">
        {rows.map((row) => (
          <div key={row.category} className="flex min-w-0 flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-start sm:gap-4">
            <Link
              href={withScope(pagePath, scope, { view, cat: activeCategory === row.category ? null : row.category })}
              data-br={BR.pages.categoryLabel}
              aria-current={activeCategory === row.category ? 'true' : undefined}
              title={activeCategory === row.category ? 'Show every category' : `Show ${categoryName(row.category)} alone`}
              className="inline-flex min-h-8 shrink-0 items-center gap-2 rounded text-caption text-text-secondary hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-500 sm:w-56"
            >
              <CategoryDot category={row.category} />
              <span className="font-fw-mono tabular-nums text-text-primary">{categoryCode(row.category)}</span>
              <span className="min-w-0 truncate">{categoryName(row.category)}</span>
              <span className="ml-auto font-fw-mono tabular-nums text-text-tertiary sm:ml-0">{row.cells.length}</span>
            </Link>
            <ul className="flex min-w-0 flex-wrap gap-1.5">
              {row.cells.map((cell) => {
                const describe = [
                  `${cell.id}${cell.ch ? ` · ${cell.ch}` : ''} (${cell.status})`,
                  cell.meaning,
                  cell.theySee ? `They see: ${cell.theySee}` : null,
                ]
                  .filter(Boolean)
                  .join('\n');
                return (
                  <li key={cell.id}>
                    <Link
                      href={withScope(clubhouseHref.code(cell.id), scope)}
                      data-br={BR.pages.matrixCell}
                      title={describe}
                      aria-label={`${cell.id}${cell.ch ? ` ${cell.ch}` : ''}, ${cell.status}: ${cell.meaning}`}
                      className={cn(
                        'flex h-8 w-9 items-center justify-center rounded-sm border font-fw-mono text-caption tabular-nums transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent-500 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11',
                        cell.status === 'implemented' && 'border-border-strong bg-surface text-text-primary hover:bg-accent-50',
                        cell.status === 'reserved' && 'border-dashed border-border-strong text-text-secondary hover:bg-surface-sunken',
                        cell.status === 'deprecated' && 'border-border-subtle bg-surface-sunken text-text-tertiary line-through',
                      )}
                    >
                      {pad2(cell.id % 100)}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

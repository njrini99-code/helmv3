/**
 * TemplateSkeleton: a first paint built from the same blocks as the page
 * (design-direction §4.6, §5 #18; ledger DS-12).
 *
 * A golf screen is a Masthead, a verdict, one Stage instrument and some rows.
 * This skeleton takes that list and reserves each block at its real height
 * (the Masthead's 36pt context row and large title, the 20/28 verdict, the
 * Stage at the instrument's height) with the page's spacing (8 masthead to
 * verdict, 24 to the stage, 32 to the rows), so the loaded page lands in place
 * instead of replacing one grey slab (DASH-08). One `role="status"` for the
 * whole screen; the atomic blocks are aria-hidden.
 */

import { Skeleton } from '../feedback/Skeleton';
import { cn } from '@/lib/utils';

export type TemplateBlock = 'masthead' | 'verdict' | 'stage' | 'rows' | 'strip';

export interface TemplateSkeletonProps {
  blocks?: TemplateBlock[];
  /** Rows per `rows` block. */
  rows?: number;
  /** The Stage box height in px: the instrument plus its header, readouts and footnote. */
  stageHeight?: number;
  label?: string;
  className?: string;
}

/** Space above a block, from the §4.1 rhythm. */
function gapBefore(prev: TemplateBlock | undefined, kind: TemplateBlock): string {
  if (!prev) return '';
  if (prev === 'masthead' && kind === 'verdict') return 'mt-2';
  if (kind === 'rows' && (prev === 'stage' || prev === 'strip')) return 'mt-8';
  return 'mt-6';
}

function Block({ kind, rows, stageHeight }: { kind: TemplateBlock; rows: number; stageHeight: number }) {
  switch (kind) {
    case 'masthead':
      return (
        <div data-block="masthead" className="flex flex-col">
          <div className="flex h-9 items-center">
            <Skeleton className="h-3.5 w-36" />
          </div>
          <div className="flex h-[38px] items-center">
            <Skeleton className="h-8 w-44" />
          </div>
        </div>
      );
    case 'verdict':
      return (
        <div data-block="verdict" className="flex flex-col">
          <div className="flex h-7 items-center">
            <Skeleton className="h-5 w-full max-w-md" />
          </div>
          <div className="flex h-7 items-center">
            <Skeleton className="h-5 w-3/5 max-w-xs" />
          </div>
        </div>
      );
    case 'stage':
      return <Skeleton data-block="stage" className="w-full rounded-card" style={{ height: stageHeight }} />;
    case 'strip':
      return <Skeleton data-block="strip" className="h-12 w-full rounded-fw-md" />;
    case 'rows':
      return (
        <div data-block="rows" className="overflow-hidden rounded-fw-sm border border-border-subtle bg-surface">
          {Array.from({ length: rows }, (_, i) => (
            <div key={i} className="flex min-h-11 items-center gap-3 border-b border-border-subtle px-4 last:border-b-0">
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-12" />
            </div>
          ))}
        </div>
      );
  }
}

export function TemplateSkeleton({
  blocks = ['masthead', 'verdict', 'stage', 'rows'],
  rows = 5,
  stageHeight = 346,
  label = 'Loading',
  className,
}: TemplateSkeletonProps) {
  return (
    <div role="status" aria-busy="true" data-slot="template-skeleton" className={cn('flex flex-col', className)}>
      <span className="sr-only">{label}</span>
      {blocks.map((b, i) => (
        <div key={`${b}-${i}`} className={gapBefore(blocks[i - 1], b)}>
          <Block kind={b} rows={rows} stageHeight={stageHeight} />
        </div>
      ))}
    </div>
  );
}

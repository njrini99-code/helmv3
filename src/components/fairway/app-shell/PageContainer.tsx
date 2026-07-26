/**
 * ============================================================================
 * Fairway · app-shell · PageContainer — THE one page frame
 * ----------------------------------------------------------------------------
 * Every dashboard route should mount its content inside this single centered
 * column so the whole product shares ONE left edge and ONE content width — the
 * "assembled by one hand" tell. It replaces the ~8 hand-rolled
 * `mx-auto w-full max-w-[...] px-... py-...` wrappers that currently disagree
 * (760–1536px widths, a Cartesian product of gutters) and don't align to the
 * glass top bar.
 *
 * Gutters match FairwayTopBar and FairwayHubSubNav (`px-4 sm:px-6 lg:px-8`) so
 * the page H1 sits on the same left rule as the top-bar title — including at
 * phone widths, where a 24px chrome gutter over 16px page roots left nothing
 * in the frame sharing an edge. Vertical rhythm: `pt-6 pb-10`, and (by
 * default) children stack with the canonical `gap-10` section rhythm.
 *
 *   <PageContainer>            → standard 1200px dashboard/roster column
 *   <PageContainer width="prose">  → 760px single-column reading (settings, dev)
 *   <PageContainer width="wide">   → 1440px dense tables/calendars
 *   <PageContainer flow={false}>   → opt out of the gap-10 child stack
 *
 * ADDITIVE — pure layout, renders inside a `.fairway-ds` scope on a bg-canvas
 * page. Adopting it across the page roots is a mechanical follow-up migration.
 * ========================================================================== */
import { forwardRef, type ElementType, type HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/** Content width. Default `standard` (1200) — the dashboard/roster column. */
export type PageContainerWidth = 'standard' | 'prose' | 'wide';

const WIDTH: Record<PageContainerWidth, string> = {
  standard: 'max-w-[1200px]',
  prose: 'max-w-[760px]',
  wide: 'max-w-[1440px]',
};

export interface PageContainerProps extends HTMLAttributes<HTMLDivElement> {
  /** Content width. Default `standard`. */
  width?: PageContainerWidth;
  /** Stack children with the canonical `gap-10` section rhythm. Default true. */
  flow?: boolean;
  /** Render as another element (e.g. `'main'`). Defaults to `div`. */
  as?: ElementType;
}

export const PageContainer = forwardRef<HTMLDivElement, PageContainerProps>(
  function PageContainer({ width = 'standard', flow = true, as, className, children, ...props }, ref) {
    const Comp = (as ?? 'div') as ElementType;
    return (
      <Comp
        ref={ref}
        data-slot="page-container"
        className={cn(
          'mx-auto w-full px-4 pb-10 pt-6 sm:px-6 lg:px-8',
          WIDTH[width],
          flow && 'flex flex-col gap-10',
          className,
        )}
        {...props}
      >
        {children}
      </Comp>
    );
  },
);

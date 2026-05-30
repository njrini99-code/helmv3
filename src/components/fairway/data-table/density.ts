/**
 * ============================================================================
 * Fairway DataTable — density presets (ADDITIVE / Wave 1)
 * ----------------------------------------------------------------------------
 * Local-only helper. Maps a `DataTableDensity` to the warm row metrics the
 * table cells use. Kept inside the group's own folder per the Wave-1 contract
 * (no top-level shared files).
 *
 * The design system asks for warm rows (~h-11 ≈ 44px). "comfortable" hits that;
 * the denser presets stay >=24px target height for WCAG 2.2 (§7.4) while
 * letting admin/CRM screens pack more rows. Header sits one step taller and
 * uses border-strong.
 * ========================================================================== */

import type { DataTableDensity } from './types';

export interface DensityMetrics {
  /** Body-cell vertical padding + min-height classes (>=24px target preserved). */
  cell: string;
  /** Header-cell vertical padding classes. */
  headerCell: string;
  /** Horizontal cell padding (shared header + body so columns line up). */
  cellX: string;
  /** Text size token for body cells. */
  text: string;
  /** Approximate row height in px — used by skeleton rows to match layout. */
  rowHeight: number;
}

const PRESETS: Record<DataTableDensity, DensityMetrics> = {
  // Warm + roomy — the default the spec calls for (~44px rows, body 15px).
  comfortable: {
    cell: 'py-3 min-h-[44px]',
    headerCell: 'py-3',
    cellX: 'px-4',
    text: 'text-body',
    rowHeight: 52,
  },
  // A measured step down for longer lists.
  cozy: {
    cell: 'py-2.5 min-h-[40px]',
    headerCell: 'py-2.5',
    cellX: 'px-4',
    text: 'text-body-sm',
    rowHeight: 44,
  },
  // Dense admin/CRM grids — still >=24px target, never cramped to a terminal.
  compact: {
    cell: 'py-2 min-h-[36px]',
    headerCell: 'py-2',
    cellX: 'px-3',
    text: 'text-body-sm',
    rowHeight: 38,
  },
};

/** Resolve the metrics for a density preset (defaults to comfortable). */
export function densityMetrics(density: DataTableDensity = 'comfortable'): DensityMetrics {
  return PRESETS[density] ?? PRESETS.comfortable;
}

/** Map alignment meta to the matching flex/text utilities. */
export function alignClass(align: 'left' | 'center' | 'right' | undefined): string {
  switch (align) {
    case 'right':
      return 'text-right justify-end';
    case 'center':
      return 'text-center justify-center';
    default:
      return 'text-left justify-start';
  }
}

/**
 * UI primitives barrel.
 *
 * Wave W5A introduces the canonical chart primitives — a single chart
 * surface (ChartShell), tooltip (ChartTooltip), legend (ChartLegend), and the
 * canonical data-viz palette (CHART_PALETTE). They are re-exported here so
 * consumers can `import { ChartShell, ChartTooltip, ChartLegend, CHART_PALETTE }
 * from '@/components/ui'`.
 *
 * Additive only: existing per-file imports (e.g. `@/components/ui/button`)
 * keep working unchanged.
 */

export { ChartShell } from './chart-shell';
export type { ChartShellProps, ChartMobileVariant } from './chart-shell';

export { ChartTooltip } from './chart-tooltip';
export type { ChartTooltipProps, ChartTooltipRow } from './chart-tooltip';

export { ChartLegend, CHART_PALETTE } from './chart-legend';
export type { ChartLegendProps, ChartLegendItem, ChartPaletteRole } from './chart-legend';

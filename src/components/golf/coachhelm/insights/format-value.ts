import type { InsightUnit } from '@/lib/coachhelm/v2/insights/types';

/**
 * Formats an evidence value given its unit. Prefers the pre-formatted
 * `your_value_display` string when present (generators render it once with
 * the right rounding/sign rules, so UI code shouldn't second-guess them).
 *
 * Pulled out of EvidencePanel.tsx into its own leaf module: DiagnosisPanel.tsx
 * imports this, and EvidencePanel.tsx imports DiagnosisPanel (to render it),
 * so a `formatValue` re-export living inside EvidencePanel.tsx created an
 * import cycle (flagged by `npm run check:cycles`). EvidencePanel.tsx
 * re-exports `formatValue` from here so its own existing callers/tests are
 * unaffected.
 */
export function formatValue(
  value: number,
  unit: InsightUnit,
  display?: string,
): string {
  if (display && display.trim().length > 0) return display;
  switch (unit) {
    case 'percent': {
      // your_value for `percent` is a 0..1 fraction; scale for display.
      const pct = Math.abs(value) <= 1 ? value * 100 : value;
      return `${Math.round(pct)}%`;
    }
    case 'strokes': {
      const sign = value > 0 ? '+' : '';
      return `${sign}${value.toFixed(1)}`;
    }
    case 'yards':
      return `${Math.round(value)} yd`;
    case 'feet':
      return `${Math.round(value)} ft`;
    case 'count':
      return `${Math.round(value)}`;
    default:
      return String(value);
  }
}

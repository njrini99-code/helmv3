// =============================================================================
// src/components/lifting/soreness/severity-colors.ts
//
// Shared severity color helpers — used by both silhouettes, the slider,
// the selected-region list, and the Performance history overlay.
// Calm heat scale: 0 neutral → green/teal → amber → muted orange/red at 9-10.
// NO neon. All rgba values are tested against cream (#FFFEFA) bg.
// =============================================================================

/** Radial glow fill color (SVG overlay fill) */
export function severityFill(severity: number): string {
  if (severity === 0) return 'rgba(22, 163, 74, 0.16)';   // helm-green whisper
  if (severity <= 2) return 'rgba(34, 197, 94, 0.30)';   // soft green
  if (severity <= 4) return 'rgba(234, 179, 8, 0.38)';   // soft amber-yellow
  if (severity <= 6) return 'rgba(245, 158, 11, 0.48)';  // amber
  if (severity <= 8) return 'rgba(234, 88, 12, 0.54)';   // muted orange
  return 'rgba(185, 28, 28, 0.60)';                        // deep muted red
}

/** SVG stroke color for the selected region outline */
export function severityStroke(severity: number): string {
  if (severity === 0) return 'rgba(22, 163, 74, 0.60)';
  if (severity <= 2) return 'rgba(22, 163, 74, 0.75)';
  if (severity <= 4) return 'rgba(161, 98, 7, 0.65)';
  if (severity <= 6) return 'rgba(180, 83, 9, 0.75)';
  if (severity <= 8) return 'rgba(194, 65, 12, 0.85)';
  return 'rgba(153, 27, 27, 0.85)';
}

/** Tailwind track color for the slider */
export function severityTrackClass(severity: number): string {
  if (severity <= 2) return 'bg-primary-400';
  if (severity <= 4) return 'bg-yellow-400';
  if (severity <= 6) return 'bg-amber-500';
  if (severity <= 8) return 'bg-orange-600';
  return 'bg-red-700';
}

/** Tailwind thumb border+bg for the slider */
export function severityThumbClass(severity: number): string {
  if (severity <= 2) return 'border-primary-500 bg-primary-50';
  if (severity <= 4) return 'border-yellow-500 bg-yellow-50';
  if (severity <= 6) return 'border-amber-500 bg-amber-50';
  if (severity <= 8) return 'border-orange-600 bg-orange-50';
  return 'border-red-700 bg-red-50';
}

/** Tailwind text color for the severity number */
export function severityTextClass(severity: number): string {
  if (severity === 0) return 'text-warm-400';
  if (severity <= 2) return 'text-primary-700';
  if (severity <= 4) return 'text-yellow-600';
  if (severity <= 6) return 'text-amber-600';
  if (severity <= 8) return 'text-orange-700';
  return 'text-red-700';
}

/** Human label for a severity number */
export const SEVERITY_LABELS: Record<number, string> = {
  0: 'None',
  1: 'Light', 2: 'Light',
  3: 'Noticeable', 4: 'Noticeable',
  5: 'Moderate', 6: 'Moderate',
  7: 'High', 8: 'High',
  9: 'Severe', 10: 'Severe',
};

/** Badge Tailwind classes + text label for the region list */
export function severityBadge(severity: number): { cls: string; label: string } {
  if (severity <= 0) return { cls: 'bg-warm-100 text-warm-500', label: 'None' };
  if (severity <= 2) return { cls: 'bg-green-100 text-green-700', label: 'Light' };
  if (severity <= 4) return { cls: 'bg-yellow-100 text-yellow-700', label: 'Noticeable' };
  if (severity <= 6) return { cls: 'bg-amber-100 text-amber-700', label: 'Moderate' };
  if (severity <= 8) return { cls: 'bg-orange-100 text-orange-700', label: 'High' };
  return { cls: 'bg-red-100 text-red-700', label: 'Severe' };
}

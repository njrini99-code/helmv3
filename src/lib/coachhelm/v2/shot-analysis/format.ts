/**
 * Human-readable formatters for shot-analysis context keys.
 *
 * The engine produces compact internal keys (`green_0-3`, `fairway_125-150`)
 * from `baselineKey()` in shot-level-sg.ts. Raw keys leaking into the UI is a
 * bug — every display path should route through these helpers so players and
 * coaches see "0-3 ft putts" / "125-150 yd from fairway" instead.
 */

export type ShotLie =
  | 'green'
  | 'fairway'
  | 'rough'
  | 'bunker'
  | 'tee'
  | 'recovery'
  | string;

const LIE_DISPLAY: Record<string, string> = {
  green: 'Green',
  fairway: 'Fairway',
  rough: 'Rough',
  bunker: 'Bunker',
  tee: 'Tee',
  recovery: 'Recovery',
};

function titleCase(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * "green" → "Green", unknown lies → title-cased passthrough.
 */
export function formatLie(lie: ShotLie | null | undefined): string {
  if (!lie) return '—';
  return LIE_DISPLAY[lie] ?? titleCase(String(lie));
}

/**
 * "0-3" (green) → "0-3 ft", "125-150" (other) → "125-150 yd",
 * "50+" (green) → "50+ ft", "250+" (other) → "250+ yd".
 */
export function formatDistanceRange(
  distanceRange: string | null | undefined,
  lie: ShotLie | null | undefined,
): string {
  if (!distanceRange) return '—';
  const unit = lie === 'green' ? 'ft' : 'yd';
  return `${distanceRange} ${unit}`;
}

/**
 * Full human-readable label for a weakness row, e.g.
 *   { lie: 'green', distanceRange: '0-3' } → "0-3 ft putts"
 *   { lie: 'fairway', distanceRange: '125-150' } → "125-150 yd approach from fairway"
 *   { lie: 'bunker', distanceRange: '25-50' } → "25-50 yd from bunker"
 *   { lie: 'tee', distanceRange: '250+' } → "250+ yd tee shots"
 */
export function formatShotContext(input: {
  lie: ShotLie | null | undefined;
  distanceRange: string | null | undefined;
  context?: string | null;
}): string {
  const lie = (input.lie ?? '').toString();
  const range = input.distanceRange?.toString() ?? '';

  // Fallback: if we're handed just a raw combined key, try to split it.
  if (!lie || !range) {
    if (typeof input.context === 'string' && input.context.includes('_')) {
      const [rawLie, ...rest] = input.context.split('_');
      return formatShotContext({
        lie: rawLie ?? '',
        distanceRange: rest.join('_'),
      });
    }
    return input.context ?? '—';
  }

  if (lie === 'green') return `${range} ft putts`;
  if (lie === 'tee') return `${range} yd tee shots`;
  if (lie === 'fairway') return `${range} yd approach from fairway`;
  if (lie === 'rough') return `${range} yd from rough`;
  if (lie === 'bunker') return `${range} yd from bunker`;
  if (lie === 'recovery') return `${range} yd recovery shot`;
  return `${range} yd from ${formatLie(lie).toLowerCase()}`;
}

import type { ToolEnvelope } from './provenance';

/**
 * The window a read actually used, in the words the scope line shows ("last 10 rounds", "this season"). Stamped on the envelope as
 * `window_label` by the read wrappers, so the line says what the answer was read over and not what the question's words guessed. Pure; no
 * label for a read that has no window of its own (the roster, tasks, travel) or that returned nothing.
 */

const ROUNDS: Record<string, string> = { last5: 'last 5 rounds', last10: 'last 10 rounds', last20: 'last 20 rounds', season: 'this season' };
/** Reads whose input names a round-count window (`window`). */
const BY_WINDOW = new Set(['get_player_metrics', 'compare_players', 'get_team_metric_ranking', 'get_player_weakest_areas', 'get_putting_distance_profile']);
/** Reads whose input names a count of days. */
const BY_DAYS = new Set(['get_team_rounds', 'get_shot_pattern', 'get_proximity_by_band', 'get_practice']);

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** True when every figure the read carries came from the stats cache, whose window is its own and lags. */
function allCache(e: ToolEnvelope): boolean {
  const sources = [...e.measurements.map((m) => m.source), ...e.series.map((s) => s.source)];
  const detailWindow = (e.detail as { window?: unknown } | undefined)?.window;
  return detailWindow === 'cache' || (sources.length > 0 && sources.every((s) => s === 'stats cache'));
}

export function windowLabelOf(tool: string, input: Record<string, unknown>, envelope: ToolEnvelope): string | undefined {
  if (envelope.coverage === 'unavailable' || envelope.coverage === 'empty') return undefined;
  if (BY_WINDOW.has(tool)) {
    if (allCache(envelope)) return 'all recorded rounds';
    const w = typeof input.window === 'string' ? input.window : 'last10';
    return ROUNDS[w];
  }
  if (tool === 'get_season_scoring') return 'this season';
  if (tool === 'get_player_trend' || tool === 'get_recent_rounds') {
    const n = num(input.last_n);
    return n ? `last ${n} ${n === 1 ? 'round' : 'rounds'}` : undefined;
  }
  if (BY_DAYS.has(tool)) {
    const n = num(input.since_days);
    return n ? `last ${n} days` : undefined;
  }
  return undefined;
}

/** The label stamped on a copy of the envelope, or the envelope itself when the read has no window to name. */
export function withWindowLabel<E extends ToolEnvelope>(tool: string, input: unknown, envelope: E): E {
  const label = windowLabelOf(tool, (input && typeof input === 'object' ? input : {}) as Record<string, unknown>, envelope);
  return label ? { ...envelope, window_label: label } : envelope;
}

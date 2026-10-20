import { formatMetricText, getMetricDefinition, isGolfMetricId } from '@/lib/golf/metrics/display-registry';
import { NO_DATA } from '../../lib/format';

/**
 * Focus areas and goals as people read them (F-54): a metric goal titled by its id ("Goal — putts_made_3_5ft_pct")
 * reads by the metric's name, and values are formatted by the metric when it is known, otherwise rounded to two
 * places, never a raw float ("15.285714285714286").
 */
const GOAL_ID = /^(goal|focus)\s*[—–-]\s*([a-z0-9_]+)$/i;

export function devTitle(title: string): string {
  const m = GOAL_ID.exec(title.trim());
  if (!m || !isGolfMetricId(m[2]!)) return title;
  return getMetricDefinition(m[2]!).label;
}

/** The metric a goal or focus area tracks: its own column when it has one, else the id in a generated title. */
export function devMetric(title: string, metric?: string | null): string | null {
  if (metric && isGolfMetricId(metric)) return metric;
  const m = GOAL_ID.exec(title.trim());
  return m && isGolfMetricId(m[2]!) ? m[2]! : null;
}

export function devValue(v: number | null | undefined, metric: string | null): string {
  if (v == null || !Number.isFinite(v)) return NO_DATA;
  if (metric) return formatMetricText(metric, v);
  return String(Math.round(v * 100) / 100);
}

/** "47.7 → target 68.5", or "No target set". */
export function devProgress(f: { title: string; metric?: string | null; current: number | null; baseline: number | null; target: number | null }): string {
  if (f.target == null) return 'No target set';
  const metric = devMetric(f.title, f.metric);
  return `${devValue(f.current ?? f.baseline, metric)} → target ${devValue(f.target, metric)}`;
}

/** "Now 46.5 · target 68.5", or the goal's state when nothing is measured yet. */
export function goalLine(g: { title: string; state: string | null; current: number | null; target: number | null }): string {
  if (g.current == null) return g.state ?? 'Active';
  const metric = devMetric(g.title);
  return `Now ${devValue(g.current, metric)}${g.target != null ? ` · target ${devValue(g.target, metric)}` : ''}`;
}

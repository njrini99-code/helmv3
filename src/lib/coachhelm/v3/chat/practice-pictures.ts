import type { ToolEnvelope } from './provenance';

/**
 * The picture under a finished practice read (S-ASK.read-pictures), from that read's own detail. A read with nothing to draw gets no picture. The calendar and class pictures need
 * the practice's window, which these reads don't carry; they stay text on the live thread.
 */
export function practicePicture(tool: string, envelope: ToolEnvelope): { picture?: unknown } {
  const detail = (envelope.detail ?? {}) as Record<string, unknown>;
  if (tool === 'get_team_strokes_gained') {
    const a = detail.areas as Record<string, number | null> | undefined;
    if (!a) return {};
    const rows = [['Off the tee', a.tee], ['Approach', a.approach], ['Around the green', a.short], ['Putting', a.putting]].flatMap(([label, value]) => (typeof value === 'number' ? [{ label: label as string, value }] : []));
    return rows.length ? { picture: { kind: 'sg', title: 'Strokes gained a round, team', rows } } : {};
  }
  if (tool === 'get_drill_bank') {
    const drills = (detail.drills as Array<{ title: string; kind?: string | null }> | undefined) ?? [];
    if (!drills.length) return {};
    const kind = (k: string | null | undefined) => (k === 'random' || k === 'pressure' ? k : 'skill');
    return { picture: { kind: 'dr', cards: drills.slice(0, 3).map((d) => ({ name: d.title, kind: kind(d.kind) })), more: Math.max(0, drills.length - 3) } };
  }
  if (tool === 'get_team_putting_profile') {
    const rows = envelope.measurements.flatMap((m) => (m.unit === 'percent' && typeof m.value === 'number' ? [{ label: m.metric_label, pct: m.value, tour: null }] : [])).slice(0, 4);
    return rows.length ? { picture: { kind: 'pd', title: 'Made, team', rows } } : {};
  }
  return {};
}

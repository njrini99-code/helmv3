import type { UIMessage } from 'ai';

/**
 * The window the last turn's reads actually used, for the scope line: each read's envelope carries `window_label` ("last 10 rounds",
 * "this season"; stamped by the read wrapper). Only the turn after the last question counts. One label when the reads agree, up to two
 * when they don't, newest first; null before any read has a window, and the line falls back to the question's own words.
 */
export function lastTurnWindow(messages: readonly Pick<UIMessage, 'role' | 'parts'>[]): string | null {
  const lastUser = messages.map((m) => m.role).lastIndexOf('user');
  const labels: string[] = [];
  for (const m of messages.slice(lastUser + 1)) {
    if (m.role !== 'assistant') continue;
    for (const p of m.parts) {
      if (p.type !== 'data-evidence') continue;
      const label = (p as { data?: { envelope?: { window_label?: unknown } } }).data?.envelope?.window_label;
      if (typeof label === 'string' && label) labels.push(label);
    }
  }
  const distinct = [...new Set(labels.reverse())].slice(0, 2);
  return distinct.length ? distinct.join(', ') : null;
}

/** Reads that are about golf in general, not about this team or player. */
const GENERAL_READS = new Set(['get_golf_reference', 'get_metric_definitions']);

/**
 * True when every read of the last turn was general golf knowledge (the golf reference, a metric's definition): the answer is not about the
 * team or the player, so the scope line says so instead of "Reading My rounds".
 */
export function lastTurnIsGeneral(messages: readonly Pick<UIMessage, 'role' | 'parts'>[]): boolean {
  const lastUser = messages.map((m) => m.role).lastIndexOf('user');
  const tools: string[] = [];
  for (const m of messages.slice(lastUser + 1)) {
    if (m.role !== 'assistant') continue;
    for (const p of m.parts) {
      if (p.type !== 'data-evidence') continue;
      const tool = (p as { data?: { tool?: unknown } }).data?.tool;
      tools.push(typeof tool === 'string' ? tool : '');
    }
  }
  return tools.length > 0 && tools.every((t) => GENERAL_READS.has(t));
}

/** Who a question is about: the first player it names (a full name, or a first name), else the team. */
export function scopeWho(question: string, team: string, names: readonly string[]): string {
  const q = question.toLowerCase();
  return names.find((n) => q.includes(n.toLowerCase()) || q.includes((n.split(' ')[0] ?? n).toLowerCase())) ?? team;
}

/** The window one turn's reads used, for its leaf's running head: one label when they agree, two when they don't, newest first. */
export function windowOf(envelopes: ReadonlyArray<{ window_label?: unknown }>): string | null {
  const labels = envelopes.flatMap((e) => (typeof e.window_label === 'string' && e.window_label ? [e.window_label] : []));
  const distinct = [...new Set(labels.reverse())].slice(0, 2);
  return distinct.length ? distinct.join(', ') : null;
}

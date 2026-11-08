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

/**
 * CoachHelm reads: the content hash, and the decision whether a new read is saved.
 *
 * The hash is over what a coach sees (every number and every word), never over when it was computed: `as_of` is left
 * out, so a nightly run that changes nothing writes nothing. Keys are sorted so the same content hashes the same.
 */
import { createHash } from 'node:crypto';
import type { ReadPayload } from './types';

/** JSON with object keys sorted at every level. */
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function contentHash(payload: ReadPayload): string {
  const { as_of: _asOf, ...seen } = payload;
  return createHash('sha256').update(stableJson(seen)).digest('hex');
}

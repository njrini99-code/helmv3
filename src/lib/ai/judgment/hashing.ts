import { createHash } from 'node:crypto';

/** Canonical JSON: object keys sorted recursively so equal states hash equal. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortKeys((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/** Hash of the exact state sent to the provider. */
export function hashState(state: unknown): string {
  return sha256Hex(canonicalJson(state));
}

/**
 * Stable, non-reversible key for an entity (round id, fingerprint…) so the
 * evaluation row can be correlated without storing the raw key. Salted with
 * a fixed namespace so it is not a bare sha256 of a UUID.
 */
export function hashEntityKey(entityType: string, key: string): string {
  return sha256Hex(`helm-judgment:${entityType}:${key}`).slice(0, 32);
}

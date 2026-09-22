import { describe, expect, it } from 'vitest';
import { redactState, redactString, REDACT_LIMITS } from '../redact';
import { canonicalJson, hashEntityKey, hashState } from '../hashing';

describe('redactState', () => {
  it('drops person and secret keys at any depth', () => {
    const out = redactState({
      email: 'a@b.co', first_name: 'A', api_key: 'x', nested: { player_name: 'B', authorization: 'y', keep: 1 }, ok: true,
    });
    expect(out).toEqual({ nested: { keep: 1 }, ok: true });
  });

  it('masks emails, phones, JWTs and bearer tokens inside strings', () => {
    expect(redactString('contact a.b@c.io or +1 (555) 123-4567')).toBe('contact [email] or [phone]');
    expect(redactString('Bearer abcdefghijklmnopqrstuvwxyz0123')).toBe('bearer [token]'.replace('bearer', 'Bearer'));
    expect(redactString('hdr aaaaaaaaaaaaaaaaaa.bbbbbbbbbbbbbbbbbb.cccccccccccccccccc')).toBe('hdr [jwt]');
  });

  it('bounds string length, depth and arrays', () => {
    const long = 'x'.repeat(2000);
    expect(redactString(long).length).toBe(REDACT_LIMITS.maxStringLength + 1);
    const deep = redactState({ a: { b: { c: { d: { e: { f: { g: { h: 1 } } } } } } } }) as Record<string, unknown>;
    expect(JSON.stringify(deep)).toContain('[depth]');
    expect((redactState(Array.from({ length: 100 }, (_, i) => i)) as number[]).length).toBe(REDACT_LIMITS.maxArrayLength);
  });
});

describe('hashing', () => {
  it('canonical JSON is key-order independent', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe(canonicalJson({ a: { c: 3, d: 2 }, b: 1 }));
    expect(hashState({ b: 1, a: 2 })).toBe(hashState({ a: 2, b: 1 }));
  });

  it('entity hashes are stable, namespaced and not the bare key', () => {
    const h = hashEntityKey('trace', 'abc');
    expect(h).toHaveLength(32);
    expect(h).toBe(hashEntityKey('trace', 'abc'));
    expect(h).not.toBe(hashEntityKey('incident', 'abc'));
  });
});

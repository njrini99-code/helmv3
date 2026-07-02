import { describe, it, expect } from 'vitest';
import { isSafeInternalPath } from '@/lib/utils/safe-redirect';

describe('isSafeInternalPath', () => {
  it('accepts golf and baseball app paths', () => {
    expect(isSafeInternalPath('/golf/dashboard')).toBe(true);
    expect(isSafeInternalPath('/golf/join/ABC123')).toBe(true);
    expect(isSafeInternalPath('/baseball/dashboard/roster')).toBe(true);
  });

  it('accepts the Helm Bridge /admin surface (top-level and nested)', () => {
    expect(isSafeInternalPath('/admin')).toBe(true);
    expect(isSafeInternalPath('/admin/errors')).toBe(true);
    expect(isSafeInternalPath('/admin/users/123/view-as')).toBe(true);
  });

  it('does NOT treat GolfHelm-namespaced admin as the Bridge surface, but it is still safe', () => {
    // /golf/admin already matched the pre-existing /golf/ prefix — unaffected
    // by the /admin allowance, and must keep working exactly as before.
    expect(isSafeInternalPath('/golf/admin')).toBe(true);
  });

  it('rejects null, undefined, and empty string', () => {
    expect(isSafeInternalPath(null)).toBe(false);
    expect(isSafeInternalPath(undefined)).toBe(false);
    expect(isSafeInternalPath('')).toBe(false);
  });

  it('rejects lookalike paths that are not actually internal', () => {
    expect(isSafeInternalPath('/administrator')).toBe(false);
    expect(isSafeInternalPath('/administrator/panel')).toBe(false);
    expect(isSafeInternalPath('/dashboard')).toBe(false);
    expect(isSafeInternalPath('golf/dashboard')).toBe(false); // missing leading slash
  });

  it('rejects protocol-relative open-redirect attempts', () => {
    expect(isSafeInternalPath('//evil.com')).toBe(false);
    expect(isSafeInternalPath('//evil.com/admin')).toBe(false);
    expect(isSafeInternalPath('/golf/dashboard//evil.com')).toBe(false);
  });

  it('rejects absolute URLs and scheme-relative tricks', () => {
    expect(isSafeInternalPath('https://evil.com/admin')).toBe(false);
    expect(isSafeInternalPath('http://evil.com')).toBe(false);
    expect(isSafeInternalPath('javascript:alert(1)')).toBe(false);
  });

  it('rejects backslash variants some browsers collapse to external origins', () => {
    expect(isSafeInternalPath('/\\evil.com')).toBe(false);
    expect(isSafeInternalPath('/admin\\@evil.com')).toBe(false);
  });

  it('rejects embedded whitespace and control characters', () => {
    expect(isSafeInternalPath('/admin \n/evil')).toBe(false);
    expect(isSafeInternalPath('/golf/dashboard\t')).toBe(false);
    expect(isSafeInternalPath('/admin ')).toBe(false);
  });
});

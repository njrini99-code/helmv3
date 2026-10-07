import { describe, expect, it } from 'vitest';
import {
  supabaseConnectSrc,
  supabaseCspHosts,
  supabaseFrameSrc,
} from '../supabase-csp.mjs';
import { PRODUCTION_SUPABASE_HOST } from '../image-remote-patterns.mjs';

describe('supabase-csp', () => {
  it('always trusts the production project and never a wildcard', () => {
    expect(supabaseCspHosts('')).toEqual([PRODUCTION_SUPABASE_HOST]);
    expect(supabaseConnectSrc('')).not.toContain('*');
    expect(supabaseFrameSrc('')).toBe(`https://${PRODUCTION_SUPABASE_HOST}`);
  });

  it('adds a different https <ref>.supabase.co project once', () => {
    expect(supabaseCspHosts('https://abcdefghijklmnopqrst.supabase.co')).toEqual([
      PRODUCTION_SUPABASE_HOST,
      'abcdefghijklmnopqrst.supabase.co',
    ]);
    expect(supabaseCspHosts(`https://${PRODUCTION_SUPABASE_HOST}/rest/v1`)).toEqual([
      PRODUCTION_SUPABASE_HOST,
    ]);
  });

  it('emits https and wss sources for connect-src', () => {
    expect(supabaseConnectSrc('')).toBe(
      `https://${PRODUCTION_SUPABASE_HOST} wss://${PRODUCTION_SUPABASE_HOST}`,
    );
  });

  it.each([
    'http://abc.supabase.co',
    'https://abc.supabase.co:8443',
    'https://user@abc.supabase.co',
    'https://abc.supabase.co.evil.com',
    'https://deep.abc.supabase.co',
    'not a url',
    'http://127.0.0.1:54321',
  ])('ignores %s', (url) => {
    expect(supabaseCspHosts(url)).toEqual([PRODUCTION_SUPABASE_HOST]);
  });
});

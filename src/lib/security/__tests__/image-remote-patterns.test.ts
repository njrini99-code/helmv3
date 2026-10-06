// =============================================================================
// next/image's optimizer fetches whatever `images.remotePatterns` allows, on the
// server. GHSA-cjq9-62q9-8jv4 (image-optimizer SSRF) needs an allowlisted host an
// attacker can influence, and a `**.supabase.co` wildcard is one: anyone can create
// a Supabase project. The assertions below mostly check what a production build
// does NOT allow.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// Plain .mjs on purpose: next.config.mjs imports the same module at build time.
import { imageRemotePatterns, PRODUCTION_SUPABASE_HOST } from '../image-remote-patterns.mjs';

type Pattern = { protocol: string; hostname: string; port?: string; pathname: string };
const asFn = imageRemotePatterns as (url?: string) => Pattern[];

const PROD = {
  protocol: 'https',
  hostname: 'qmnssrrolpinvwjjnufo.supabase.co',
  pathname: '/storage/v1/object/public/**',
};

describe('imageRemotePatterns: production allows only its own project', () => {
  it('pins the production project ref', () => {
    expect(PRODUCTION_SUPABASE_HOST).toBe('qmnssrrolpinvwjjnufo.supabase.co');
  });

  it.each([
    ['the real production project URL', 'https://qmnssrrolpinvwjjnufo.supabase.co'],
    ['an empty value', ''],
    ['whitespace only', '   '],
    ['an unparseable value', 'not a url'],
    ['a non-supabase host', 'https://evil.com'],
    ['a supabase.in project', 'https://someproject.supabase.in'],
    ['a nested supabase.co label', 'https://a.b.supabase.co'],
    ['a supabase.co lookalike suffix', 'https://x.supabase.co.evil.com'],
    ['plain http to a supabase.co project', 'http://someproject.supabase.co'],
    ['a supabase.co project on a custom port', 'https://someproject.supabase.co:8443'],
    ['loopback as a subdomain label', 'https://127.0.0.1.evil.com'],
    ['loopback as a prefix', 'https://localhost.attacker.net'],
    ['loopback in the path only', 'https://evil.com/127.0.0.1'],
    ['loopback as userinfo', 'http://127.0.0.1@evil.com'],
    ['a non-http scheme on loopback', 'ftp://127.0.0.1:54321'],
  ])('allows nothing beyond production for %s', (_label, url) => {
    expect(asFn(url)).toEqual([PROD]);
  });

  it('never emits a wildcard hostname', () => {
    for (const url of ['', 'https://abc.supabase.co', 'http://127.0.0.1:54321']) {
      for (const p of asFn(url)) expect(p.hostname).not.toContain('*');
    }
  });

  it('scopes every pattern to public storage', () => {
    for (const url of ['', 'https://abc.supabase.co', 'http://localhost:54321']) {
      for (const p of asFn(url)) expect(p.pathname).toBe('/storage/v1/object/public/**');
    }
  });
});

describe('imageRemotePatterns: the configured project and local stack still work', () => {
  it('adds the configured supabase.co project (e.g. the CI dummy build URL)', () => {
    expect(asFn('https://dummy-ci-build.supabase.co')).toEqual([
      PROD,
      { protocol: 'https', hostname: 'dummy-ci-build.supabase.co', pathname: PROD.pathname },
    ]);
  });

  it.each([
    ['127.0.0.1', 'http://127.0.0.1:54321', { protocol: 'http', hostname: '127.0.0.1', port: '54321' }],
    ['localhost', 'http://localhost:54321', { protocol: 'http', hostname: 'localhost', port: '54321' }],
    ['localhost with trailing slash', 'http://localhost:54321/', { protocol: 'http', hostname: 'localhost', port: '54321' }],
  ])('adds the loopback stack for %s', (_label, url, expected) => {
    expect(asFn(url)).toEqual([PROD, { ...expected, pathname: PROD.pathname }]);
  });
});

describe('next.config.mjs uses the helper', () => {
  const config = readFileSync(join(process.cwd(), 'next.config.mjs'), 'utf8');

  it('builds remotePatterns from imageRemotePatterns()', () => {
    expect(config).toMatch(/remotePatterns:\s*imageRemotePatterns\(\)/);
  });

  it('has no wildcard supabase hostname', () => {
    expect(config).not.toMatch(/hostname:\s*['"]\*\*?\.supabase/);
  });
});

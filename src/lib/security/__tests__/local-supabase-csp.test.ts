// =============================================================================
// The CSP must admit a LOCAL Supabase stack — and production must gain nothing.
//
// WHY THIS EXISTS. `connect-src` allowed `https://*.supabase.co` plus
// `ws://localhost:*` / `ws://127.0.0.1:*` (those are for Next's HMR), so plain
// HTTP fetches to a loopback Supabase stack were blocked by our own policy:
//
//   Connecting to 'http://127.0.0.1:54321/auth/v1/user' violates the following
//   Content Security Policy directive: "connect-src 'self' https://*.supabase.co …"
//
// It presented as a HANG, never as a CSP error: the baseball dashboard sat forever
// on "Opening your command center" because the client `getUser()` fetch was
// refused, so `DashboardSessionGuard` never settled. `supabase start` +
// `npm run dev` had therefore never been able to authenticate in a browser, and the
// CI smoke gate failed all 16 authenticated renders once it was repointed at a
// local stack. It was only found in the Playwright trace's console output.
//
// THE INVARIANT WORTH GUARDING IS THE NEGATIVE ONE. The easy "fix" is to hardcode
// `http://127.0.0.1:*` into `connect-src`, which loosens the policy for every
// production visitor to buy a developer convenience. So the assertions below care
// far more about what production does NOT get than about what local does.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// Plain .mjs on purpose: next.config.mjs runs outside the TS pipeline and has to
// import the same module, so the scoping logic cannot live in a .ts file.
import { localSupabaseConnectSrc } from '../local-supabase-csp.mjs';

const asFn = localSupabaseConnectSrc as (url?: string) => string;

describe('localSupabaseConnectSrc — production must gain nothing', () => {
  it.each([
    ['the real production project URL', 'https://qmnssrrolpinvwjjnufo.supabase.co'],
    ['any supabase.co project', 'https://someproject.supabase.co'],
    ['a supabase.in project', 'https://someproject.supabase.in'],
    ['the CI dummy fallback', 'https://dummy-ci-build.supabase.co'],
  ])('adds nothing for %s', (_label, url) => {
    expect(asFn(url)).toBe('');
  });

  it.each([
    // A loopback host must be the WHOLE host, never a prefix or a substring.
    ['loopback as a subdomain label', 'https://127.0.0.1.evil.com'],
    ['loopback as a prefix', 'https://localhost.attacker.net'],
    ['loopback in the path only', 'https://evil.com/127.0.0.1'],
    ['loopback in a query string', 'https://evil.com/?h=http://127.0.0.1:54321'],
    ['loopback as userinfo', 'https://127.0.0.1@evil.com'],
  ])('rejects %s', (_label, url) => {
    expect(asFn(url)).toBe('');
  });

  it.each([
    ['an unparseable value', 'not a url'],
    ['an empty string', ''],
    ['whitespace only', '   '],
  ])('adds nothing for %s', (_label, url) => {
    expect(asFn(url)).toBe('');
  });
});

describe('localSupabaseConnectSrc — a local stack is admitted', () => {
  it.each([
    ['127.0.0.1 with a port', 'http://127.0.0.1:54321', 'http://127.0.0.1:54321 ws://127.0.0.1:54321'],
    ['localhost with a port', 'http://localhost:54321', 'http://localhost:54321 ws://localhost:54321'],
    ['ipv6 loopback', 'http://[::1]:54321', 'http://[::1]:54321 ws://[::1]:54321'],
    ['no port', 'http://127.0.0.1', 'http://127.0.0.1 ws://127.0.0.1'],
  ])('admits %s over both http and ws', (_label, url, expected) => {
    // Leading space so it concatenates straight into the directive list.
    expect(asFn(url)).toBe(` ${expected}`);
  });

  it('emits a ws origin too, since Realtime shares the origin', () => {
    expect(asFn('http://127.0.0.1:54321')).toContain('ws://127.0.0.1:54321');
  });

  it('ignores a trailing slash and surrounding whitespace', () => {
    expect(asFn('  http://127.0.0.1:54321/  ')).toBe(
      ' http://127.0.0.1:54321 ws://127.0.0.1:54321',
    );
  });
});

describe('next.config.mjs actually uses it', () => {
  // A perfectly-scoped helper nobody calls is the failure mode this catches — the
  // same shape as the seed guard that lived in only one of its two callers.
  const config = readFileSync(join(process.cwd(), 'next.config.mjs'), 'utf8');

  it('imports the helper from the shared module', () => {
    expect(config).toMatch(/from '\.\/src\/lib\/security\/local-supabase-csp\.mjs'/);
  });

  it('interpolates it into connect-src, not some other directive', () => {
    const connectSrc = config.slice(
      config.indexOf('connect-src'),
      config.indexOf(';', config.indexOf('connect-src')),
    );
    expect(connectSrc).toContain('${localSupabaseConnectSrc()}');
  });

  it('does NOT hardcode a loopback http origin into the policy', () => {
    // `ws://`/`wss://` loopback entries are legitimate — they are Next's HMR
    // socket. An `http://`/`https://` loopback literal would mean production
    // shipped a policy trusting localhost, which is the thing being avoided.
    const csp = config.slice(
      config.indexOf("default-src 'self'"),
      config.indexOf("frame-ancestors"),
    );
    expect(csp).not.toMatch(/https?:\/\/127\.0\.0\.1/);
    expect(csp).not.toMatch(/https?:\/\/localhost/);
  });
});

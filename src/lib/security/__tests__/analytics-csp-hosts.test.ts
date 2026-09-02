// =============================================================================
// The analytics hosts in the CSP are EXACTLY the ones the installed SDKs reach,
// and not one wildcard more.
//
// WHY THIS EXISTS. PostHog and Datadog RUM both initialise client-side from
// src/app/layout.tsx, and until 2026-09-01 neither vendor's host appeared in the
// connect directive, so every capture was refused by our own header. The fix
// widened the policy — correctly for the hosts, but with a `*.browser-intake-`
// wildcard the SDK never uses, under a commit message that described only text
// corrections. A CSP widening is exactly the change that must be named, so this
// test pins the host list to the SDK routing that justifies each entry:
//
//   posthog-js utils/request-router.js       api  -> https://us.i.posthog.com
//                                            assets -> https://us-assets.i.posthog.com
//   posthog-js entrypoints/external-scripts-loader.js  <script> tags from `assets`
//   posthog-js remote-config.js              GET  /array/<token>/config from `assets`
//   @datadog/browser-core buildEndpointHost  site datadoghq.com -> browser-intake-datadoghq.com
//                                            a SUBDOMAIN only under usePciIntake,
//                                            internalAnalyticsSubdomain or
//                                            remoteConfigurationId
//
// Any host added or removed here must be argued from the SDK the same way.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const config = readFileSync(join(ROOT, 'next.config.mjs'), 'utf8');
const posthogProvider = readFileSync(join(ROOT, 'src/components/providers/PostHogProvider.tsx'), 'utf8');
const datadogInit = readFileSync(join(ROOT, 'src/lib/datadog/index.ts'), 'utf8');

/** The tokens of one directive, located the way local-supabase-csp.test.ts does — by first occurrence. */
function directive(name: string): string[] {
  const start = config.indexOf(`${name} `);
  expect(start, `${name} present`).toBeGreaterThan(-1);
  const end = config.indexOf(';', start);
  return config
    .slice(start + name.length, end)
    .replace(/\$\{localSupabaseConnectSrc\(\)\}/, '')
    .trim()
    .split(/\s+/);
}

const VENDOR = /posthog|datadog/;
const connect = directive('connect-src');
const script = directive('script-src');

describe('PostHog hosts follow posthog-js routing from the configured api_host', () => {
  it('the provider defaults api_host to the US ingestion host', () => {
    expect(posthogProvider).toContain("process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com'");
  });

  it('the api host is in the connect directive (events, flags, recordings)', () => {
    expect(connect).toContain('https://us.i.posthog.com');
  });

  it('the derived assets host is in BOTH directives — script tags and the JSON config fallback', () => {
    // request-router.js: `https://${region}-assets.i.posthog.com` for target 'assets'.
    // external-scripts-loader.js injects <script> from it; remote-config.js
    // falls back to a plain GET of /array/<token>/config from the same host.
    expect(script).toContain('https://us-assets.i.posthog.com');
    expect(connect).toContain('https://us-assets.i.posthog.com');
  });
});

describe('Datadog host follows @datadog/browser-core buildEndpointHost for the configured site', () => {
  it('the init defaults site to datadoghq.com', () => {
    expect(datadogInit).toContain("process.env.NEXT_PUBLIC_DD_SITE || 'datadoghq.com'");
  });

  it('the bare intake host is in the connect directive (RUM, Logs, Session Replay)', () => {
    expect(connect).toContain('https://browser-intake-datadoghq.com');
  });

  it('no wildcard, because the init sets none of the options that route to a subdomain', () => {
    // buildEndpointHost returns a subdomain of the intake host only for
    // usePciIntake (pci.), internalAnalyticsSubdomain, or remoteConfigurationId
    // (sdk-configuration.). If one of these is ever set, add THAT host by name.
    for (const option of ['usePciIntake', 'internalAnalyticsSubdomain', 'remoteConfigurationId']) {
      expect(datadogInit, `${option} would need its subdomain host added to the CSP`).not.toContain(option);
    }
    expect(connect).not.toContain('https://*.browser-intake-datadoghq.com');
  });
});

describe('the exact vendor host list — a change here is a CSP change and must be named in the PR', () => {
  it('connect directive admits exactly these vendor hosts, in this order', () => {
    expect(connect.filter((t) => VENDOR.test(t))).toEqual([
      'https://us.i.posthog.com',
      'https://us-assets.i.posthog.com',
      'https://browser-intake-datadoghq.com',
    ]);
  });

  it('script directive admits exactly this vendor host', () => {
    expect(script.filter((t) => VENDOR.test(t))).toEqual(['https://us-assets.i.posthog.com']);
  });

  it('no vendor wildcard anywhere in the policy', () => {
    const csp = config.slice(config.indexOf("default-src 'self'"), config.indexOf('frame-ancestors'));
    expect(csp).not.toMatch(/\*\.[a-z0-9.-]*(posthog|datadog)/i);
  });

  it('no vendor host leaks into a directive the SDKs do not use', () => {
    for (const name of ['style-src', 'font-src', 'media-src', 'worker-src', 'frame-src']) {
      expect(directive(name).filter((t) => VENDOR.test(t)), name).toEqual([]);
    }
  });
});

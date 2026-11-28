// =============================================================================
// `applicationKey` (next.config.mjs, withSentryConfig's SentryBuildOptions)
// and `filterKeys` (src/instrumentation-client.ts,
// thirdPartyErrorFilterIntegration) MUST name the same bundle key.
//
// WHY THIS EXISTS. The bundler plugin stamps first-party modules with
// `_sentryModuleMetadata` keyed by `applicationKey` at BUILD time; the client
// integration then checks each stack frame's module against `filterKeys` at
// RUNTIME to decide what counts as "our code" vs third-party. If the two
// strings ever drift, every frame silently reads as third-party again and
// the filter starts dropping every client error — the exact failure mode
// this integration exists to avoid, just self-inflicted instead of caused by
// a stale ignoreErrors pattern.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const config = readFileSync(join(ROOT, 'next.config.mjs'), 'utf8');
const instrumentationClient = readFileSync(join(ROOT, 'src/instrumentation-client.ts'), 'utf8');

describe('third-party error filter application key', () => {
  it('next.config.mjs sets applicationKey as a top-level SentryBuildOptions field', () => {
    expect(config).toMatch(/applicationKey:\s*'helm-web'/);
    // This repo does not use the deprecated `_experimental.turbopackApplicationKey`
    // alternative — only mention of "_experimental" allowed is inside a
    // comment explaining that. If this ever fires, someone added a real
    // `_experimental` block and the assumption behind the comment is stale.
    const codeOnly = config
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n');
    expect(codeOnly).not.toContain('_experimental');
  });

  it('instrumentation-client.ts filters using the SAME key via thirdPartyErrorFilterIntegration', () => {
    expect(instrumentationClient).toContain('thirdPartyErrorFilterIntegration({');
    expect(instrumentationClient).toMatch(/filterKeys:\s*\[\s*'helm-web'\s*\]/);
  });

  it('drops only errors whose stack is ENTIRELY third-party, not every error with one unmarked frame', () => {
    // The Turbopack runtime chunk (turbopack-*.js) runs every module factory and is not itself a module, so the
    // build plugin never stamps it. Under `drop-error-if-contains-third-party-frames`, any error thrown while a
    // module evaluates (a lazy import, next/dynamic, a top-level throw) carries one runtime frame and was dropped
    // from Sentry; production bundle 29fb4ed1 checked 2026-11-27: the runtime chunk has no `_sentryBundlerPluginAppKey`.
    expect(instrumentationClient).toContain(
      "behaviour: 'drop-error-if-exclusively-contains-third-party-frames'",
    );
    expect(instrumentationClient).not.toContain("behaviour: 'drop-error-if-contains-third-party-frames'");
  });

  it('the filter is gated to production builds only (withSentryConfig itself is dev-skipped)', () => {
    // The integration must be inside a `!isDev` conditional — see the
    // adjacent `replayIntegration` gate, which uses the identical pattern.
    expect(instrumentationClient).toContain(
      '...(!isDev ? [Sentry.thirdPartyErrorFilterIntegration({',
    );
  });

  it('next.config.mjs still skips withSentryConfig (and therefore the plugin metadata) in dev', () => {
    expect(config).toContain('export default isDev');
    expect(config).toContain('? withBundleAnalyzer(nextConfig)');
    expect(config).toContain(': withSentryConfig(');
  });
});

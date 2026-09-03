// =============================================================================
// Browser UI profiling (Sentry's `browserProfilingIntegration`, wired in
// src/instrumentation-client.ts) requires the response to carry
// `Document-Policy: js-profiling` — without it, `Profiler` construction
// throws and the integration silently never starts a profile. This test
// pins that header onto next.config.mjs's `headers()` config so a future
// edit to the security-headers block cannot drop it unnoticed.
//
// The header was ALREADY present in next.config.mjs before this task (added
// for a prior, unrelated pass at security headers) — this test documents and
// locks that in, it does not add the header.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const config = readFileSync(join(ROOT, 'next.config.mjs'), 'utf8');

describe('Document-Policy: js-profiling header', () => {
  it('is present in next.config.mjs headers()', () => {
    expect(config).toMatch(/key:\s*'Document-Policy'/);
    expect(config).toMatch(/value:\s*'js-profiling'/);
  });

  it('is set on the catch-all route so every app route gets it, not just one', () => {
    // The security-headers block starts with `source: '/:path*'` and the
    // Document-Policy header is one of the entries in ITS headers array —
    // assert Document-Policy appears before the next `source:` boundary
    // (the service-worker cache-control block), i.e. still inside the
    // catch-all route's headers list.
    const catchAllStart = config.indexOf("source: '/:path*'");
    const docPolicyIndex = config.indexOf("key: 'Document-Policy'");
    const nextSourceIndex = config.indexOf("source:", catchAllStart + "source: '/:path*'".length);

    expect(catchAllStart).toBeGreaterThan(-1);
    expect(docPolicyIndex).toBeGreaterThan(catchAllStart);
    expect(nextSourceIndex).toBeGreaterThan(-1);
    expect(docPolicyIndex).toBeLessThan(nextSourceIndex);
  });
});

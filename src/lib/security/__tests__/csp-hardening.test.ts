// =============================================================================
// The Content-Security-Policy keeps the directives that bound what an injected
// script or markup can do, and the cache headers stay safe for un-hashed files.
//
// Reads next.config.mjs as text, like its siblings in this directory, because a
// header regression must fail in CI where no server runs.
//
// Do not write the literal directive names in next.config.mjs comments: these
// tests (and their siblings) locate each directive by its first occurrence.
// =============================================================================
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const config = readFileSync(join(process.cwd(), 'next.config.mjs'), 'utf8');

/** The CSP template literal, from the header key to its closing backtick. */
function cspTemplate(): string {
  const keyAt = config.indexOf("key: 'Content-Security-Policy'");
  expect(keyAt, 'CSP header present').toBeGreaterThan(-1);
  const open = config.indexOf('`', keyAt);
  const close = config.indexOf('`', open + 1);
  return config.slice(open + 1, close);
}

function directive(name: string): string {
  const csp = cspTemplate();
  const start = csp.indexOf(`${name} `);
  expect(start, `${name} present`).toBeGreaterThan(-1);
  return csp.slice(start, csp.indexOf(';', start));
}

describe('Content-Security-Policy hardening', () => {
  it('forbids plugins, base-tag rewrites, cross-origin form posts and framing', () => {
    expect(directive('object-src')).toBe("object-src 'none'");
    expect(directive('base-uri')).toBe("base-uri 'self'");
    expect(directive('form-action')).toBe("form-action 'self'");
    expect(directive('frame-ancestors')).toBe("frame-ancestors 'none'");
  });

  it('sends unsafe-eval only outside production', () => {
    const script = directive('script-src');
    expect(script).toContain("${process.env.NODE_ENV === 'production' ? '' : \"'unsafe-eval'\"}");
    // The only mention of unsafe-eval in the policy is that development branch.
    expect(cspTemplate().match(/unsafe-eval/g)).toHaveLength(1);
  });

  it('keeps default-src closed to self', () => {
    expect(directive('default-src')).toBe("default-src 'self'");
  });
});

describe('cache headers', () => {
  it('sets immutable on no header in next.config.mjs (hashed /_next/static keeps Next\'s own)', () => {
    const valueLines = config.split('\n').filter((line) => /^\s*value:/.test(line));
    expect(valueLines.filter((line) => /immutable/.test(line))).toEqual([]);
  });

  it('caches the un-hashed public images for a day, not a year', () => {
    expect(config).toContain("value: 'public, max-age=86400, stale-while-revalidate=604800'");
  });
});

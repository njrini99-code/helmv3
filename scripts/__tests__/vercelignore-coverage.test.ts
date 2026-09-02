// `.vercelignore` REPLACES Vercel's default ignore set, so a secret that
// .gitignore hides is uploaded unless .vercelignore names it too. This pins
// the matcher behind `npm run check:vercelignore` / repo:doctor
// config.vercelignore-coverage, and then runs it against the live files so a
// new secret-bearing path added to the manifest without a matching ignore
// line turns red here as well as in CI.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  coverage,
  isCovered,
  parseIgnore,
  requiredFromManifest,
} from '../check-vercelignore-coverage.mjs';

const REPO = resolve(__dirname, '../..');

describe('gitignore-style matching, the subset Vercel honours', () => {
  const rules = (text: string) => parseIgnore(text);

  it('a bare name matches at any depth; a name with a slash is anchored', () => {
    expect(isCovered('deep/nested/context7.json', rules('context7.json'))).toBe(true);
    expect(isCovered('a/.cursor/mcp.json', rules('.cursor/mcp.json'))).toBe(false);
    expect(isCovered('.cursor/mcp.json', rules('.cursor/mcp.json'))).toBe(true);
  });

  it('a directory pattern excludes everything beneath it', () => {
    expect(isCovered('playwright/.auth/coach.json', rules('playwright/.auth/'))).toBe(true);
    expect(isCovered('playwright/.auth/', rules('playwright/.auth/'))).toBe(true);
    // ...but a trailing slash does not match a FILE of that name
    expect(isCovered('audit', rules('audit/'))).toBe(false);
  });

  it('globs: * stays within a segment, ** crosses directories', () => {
    expect(isCovered('android/upload.keystore', rules('*.keystore'))).toBe(true);
    expect(isCovered('a/b/c.pem', rules('*.pem'))).toBe(true);
    expect(isCovered('.full-review-archive-2026/x', rules('.full-review-archive-*/'))).toBe(true);
    expect(isCovered('src/x/y.png', rules('src/**/*.png'))).toBe(true);
    expect(isCovered('src/x/y.png', rules('src/*.png'))).toBe(false);
  });

  it('a later negation re-includes exactly the named path — the .env.example shape', () => {
    const r = rules('.env\n.env.*\n!.env.example');
    expect(isCovered('.env.local', r)).toBe(true);
    expect(isCovered('.env.production.local', r)).toBe(true);
    expect(isCovered('.env.example', r)).toBe(false);
  });

  it('comments and blank lines are not rules', () => {
    expect(coverage(['x'], '# x\n\n').uncovered).toEqual(['x']);
  });

  it('an uncovered path is reported, never silently dropped', () => {
    const r = coverage(['.env', '.cursor/mcp.json'], '.env\n');
    expect(r.covered).toEqual(['.env']);
    expect(r.uncovered).toEqual(['.cursor/mcp.json']);
  });
});

describe('the manifest reader', () => {
  it('reads vercel.must_ignore and ignores trailing comments', () => {
    const y = 'ci:\n  x: 1\nvercel:\n  must_ignore:\n    - .env   # live\n    - "playwright/.auth/"\n    - context7.json\nsupabase:\n  root: supabase\n';
    expect(requiredFromManifest(y)).toEqual(['.env', 'playwright/.auth/', 'context7.json']);
  });

  it('returns nothing rather than guessing when the section is absent', () => {
    expect(requiredFromManifest('ci:\n  x: 1\n')).toEqual([]);
  });
});

describe('the live repository', () => {
  it('every path the manifest forbids from the upload is excluded by .vercelignore', () => {
    const required = requiredFromManifest(readFileSync(resolve(REPO, 'config/repo/manifest.yml'), 'utf-8'));
    expect(required.length, 'manifest must name at least the .env family').toBeGreaterThan(4);
    const r = coverage(required, readFileSync(resolve(REPO, '.vercelignore'), 'utf-8'));
    expect(r.uncovered, 'paths that would be uploaded to Vercel').toEqual([]);
  });

  it('the 2026-09-01 findings stay covered by name', () => {
    const text = readFileSync(resolve(REPO, '.vercelignore'), 'utf-8');
    const r = coverage(
      ['.cursor/mcp.json', 'context7.json', 'playwright/.auth/x.json', 'momentic/auth/.momentic.env', '.momentic/mcp-cli-artifacts/a.jpeg', 'android/keystore.properties'],
      text,
    );
    expect(r.uncovered).toEqual([]);
  });
});

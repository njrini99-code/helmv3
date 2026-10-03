import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A function or constant exported from a 'use client' module is only a client reference on the server: calling it
 * from a server component throws at runtime ("Attempted to call parseHubTab() from the server but parseHubTab is on
 * the client"), which typecheck and render tests never see. Server modules may import components (PascalCase) and
 * types from a client module, nothing else.
 */

const ROOT = resolve(__dirname, '../../..');
const SCANNED = ['src/clubhouse', 'src/app/golf'];

function walk(dir: string, out: string[]) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== '__tests__' && e.name !== 'node_modules') walk(p, out);
    } else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(p);
  }
}

const clientCache = new Map<string, boolean>();
function isClient(file: string) {
  if (!clientCache.has(file)) {
    clientCache.set(file, /^\s*(?:\/\/[^\n]*\n\s*|\/\*[\s\S]*?\*\/\s*)*['"]use client['"]/.test(readFileSync(file, 'utf8')));
  }
  return clientCache.get(file)!;
}

function resolveSpec(from: string, spec: string) {
  let base: string;
  if (spec.startsWith('@/')) base = join(ROOT, 'src', spec.slice(2));
  else if (spec.startsWith('.')) base = resolve(dirname(from), spec);
  else return null;
  for (const c of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}

/** Each `server file <- client module: names` a server module imports as values that are not components. */
export function serverCallsIntoClient(files: string[]) {
  const found: string[] = [];
  for (const f of files) {
    if (isClient(f)) continue;
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/import\s+(?!type\s)([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g)) {
      const [, clause = '', spec = ''] = m;
      const target = resolveSpec(f, spec);
      if (!target || !isClient(target)) continue;
      const named = (clause.match(/\{([\s\S]*)\}/)?.[1] ?? '')
        .split(',')
        .map((x) => x.trim())
        .filter((x) => x && !x.startsWith('type '))
        .map((x) => x.split(/\s+as\s+/).pop()!);
      const def = clause.replace(/\{[\s\S]*\}/, '').replace(/,/g, '').trim();
      if (def) named.push(def);
      const values = named.filter((n) => !/^[A-Z][a-z]/.test(n) || /^[A-Z0-9_]+$/.test(n));
      if (values.length) found.push(`${relative(ROOT, f)} <- ${relative(ROOT, target)}: ${values.join(', ')}`);
    }
  }
  return found;
}

describe('client boundary', () => {
  it('no server module under src/clubhouse or src/app/golf imports a non-component value from a client module', () => {
    const files: string[] = [];
    for (const d of SCANNED) walk(join(ROOT, d), files);
    // Modules only ever bundled for the client (no server importer) may share helpers with client modules freely;
    // these are the ones that do, each checked by hand.
    const clientOnly = new Set(['src/clubhouse/screens/rounds/entry/labels.ts', 'src/clubhouse/screens/rounds/entry/setup-reads.ts']);
    const found = serverCallsIntoClient(files).filter((l) => !clientOnly.has(l.split(' <- ')[0] ?? ''));
    expect(found).toEqual([]);
  });

  it('the Team Hub route reads ?tab= through a plain module', () => {
    expect(serverCallsIntoClient([join(ROOT, 'src/clubhouse/routes/hub.tsx')])).toEqual([]);
    expect(isClient(join(ROOT, 'src/clubhouse/lib/hub-tabs.ts'))).toBe(false);
  });
});

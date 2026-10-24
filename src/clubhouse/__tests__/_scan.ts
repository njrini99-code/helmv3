import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * CONS-0: the one source walker every Clubhouse guard test uses, so a guard is about ten lines and they all read the same
 * files the same way. Not a test file (no `.test.`), so vitest doesn't collect it.
 */
export const ROOT = join(__dirname, '..'); // src/clubhouse

/** Every source file under `dir` matching `ext`, skipping test folders. */
export function walk(dir = ROOT, ext = /\.(tsx?|css)$/): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return n === '__tests__' || n === 'node_modules' ? [] : walk(p, ext);
    return ext.test(n) && !/\.test\.tsx?$/.test(n) ? [p] : [];
  });
}

/** Source with comments removed (the rules copy-apostrophes.test.ts used). */
export const code = (p: string) =>
  readFileSync(p, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\s\/\/ .*$/gm, '');

export type Hit = { file: string; line: number; text: string };

/** Each line, comments removed, that matches `re`, named by its path under src/clubhouse. */
export function hits(re: RegExp, files: string[]): Hit[] {
  const one = new RegExp(re.source, re.flags.replace('g', ''));
  const out: Hit[] = [];
  for (const f of files) {
    code(f)
      .split('\n')
      .forEach((t, i) => {
        if (one.test(t)) out.push({ file: relative(ROOT, f), line: i + 1, text: t.trim() });
      });
  }
  return out;
}

/** Ratchet: per-file counts may only fall. A listed file at 0 must be removed from the list. */
export function ratchet(found: Hit[], allow: Record<string, number>) {
  const by: Record<string, number> = {};
  for (const h of found) by[h.file] = (by[h.file] ?? 0) + 1;
  const over = Object.entries(by)
    .filter(([f, n]) => n > (allow[f] ?? 0))
    .map(([f, n]) => `${f}: ${n} > ${allow[f] ?? 0}`);
  const stale = Object.keys(allow)
    .filter((f) => !by[f])
    .map((f) => `${f}: now 0, delete it from the allowlist`);
  return { over, stale };
}

/** The other half of a tight ratchet: listed files now below their count, so the number must come down to the live one. */
export function slack(found: Hit[], allow: Record<string, number>) {
  const by: Record<string, number> = {};
  for (const h of found) by[h.file] = (by[h.file] ?? 0) + 1;
  return Object.entries(allow)
    .filter(([f, n]) => (by[f] ?? 0) > 0 && by[f]! < n)
    .map(([f, n]) => `${f}: now ${by[f]}, lower it from ${n}`);
}

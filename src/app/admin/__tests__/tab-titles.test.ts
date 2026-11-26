import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * GAP-R-17: every admin tab names its page, so an operator with several admin tabs open can tell them apart. The two
 * admin layouts carry the '%s · Admin' template and every admin page carries a bare title (a client page gets its
 * title from a layout of its own).
 */
const root = process.cwd();
const pages = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : pages(path);
    return name === 'page.tsx' ? [path] : [];
  });
const read = (path: string) => readFileSync(path, 'utf8');
const TITLE = /export const metadata(?::\s*Metadata)?\s*=\s*\{\s*title:\s*(?:'([^']+)'|\{\s*absolute:\s*'([^']+)'\s*\})/;
const titleOf = (path: string) => {
  const m = read(path).match(TITLE);
  return m ? (m[1] ?? m[2]) : null;
};

describe('admin tab titles', () => {
  it.each(['src/app/admin/layout.tsx', 'src/app/golf/admin/layout.tsx'])('%s sets the Admin template', (file) => {
    expect(read(join(root, file))).toContain("title: { template: '%s · Admin', default: 'Admin' }");
  });

  it('every admin page has its own title, with no brand suffix of its own', () => {
    const files = [...pages(join(root, 'src/app/admin')), ...pages(join(root, 'src/app/golf/admin'))];
    expect(files.length).toBeGreaterThan(20);
    const missing: string[] = [];
    for (const file of files) {
      const rel = relative(root, file);
      const client = /^\s*['"]use client['"]/.test(read(file));
      // A client page cannot export metadata; its folder's layout carries the title.
      const title = client ? titleOf(join(file, '..', 'layout.tsx')) : titleOf(file);
      if (!title) missing.push(rel);
      else expect(title, rel).not.toMatch(/Helm|\|/);
    }
    expect(missing).toEqual([]);
  });

  it('Pulse (the overview) spells the suffix out, since its own layout’s template does not reach it', () => {
    expect(titleOf(join(root, 'src/app/admin/pulse/page.tsx'))).toBe('Pulse · Admin');
  });
});

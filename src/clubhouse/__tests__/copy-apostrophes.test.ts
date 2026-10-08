import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * States audit b8 (2026-10-08): the copy mixed straight apostrophes (didn't, aren't) with curly ones, and a title
 * quoted in a toast sat in straight quotes. A page's own words use the curly marks; comments may say what they like,
 * and words a server sends are shown as it sent them. Calendar, Team Hub, Messages and Settings, with their routes;
 * the shared state files have their own check (states.test.tsx).
 */
const root = join(__dirname, '..');
const pages = ['calendar', 'hub', 'messages', 'settings'];

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

const code = (path: string) =>
  readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\s\/\/ .*$/gm, '');

describe('Page copy', () => {
  it.each(pages)('%s writes its own copy with curly apostrophes and quotes', (page) => {
    const files = [...sources(join(root, 'screens', page)), join(root, 'routes', `${page}.tsx`)];
    for (const file of files) {
      const src = code(file);
      expect(src.match(/[A-Za-z]'[A-Za-z]/g), file).toBeNull();
      expect(src, file).not.toContain('&apos;');
      // A name quoted inside the words ("Posted “Waiver”"), not an attribute value in a selector (="${id}").
      expect(src.match(/(?<![=\w])"\$\{[^}]*\}"/g), file).toBeNull();
    }
  });
});

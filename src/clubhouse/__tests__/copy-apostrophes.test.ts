import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * States audit b8 (2026-10-08): the copy mixed straight apostrophes (didn't, aren't) with curly ones, and a title
 * quoted in a toast sat in straight quotes. A page's own words use the curly marks; comments may say what they like,
 * and words a server sends are shown as it sent them. Calendar, Team Hub, Messages, Settings, Home, Stats, Roster,
 * Recruiting, CoachHelm, Classes and Rounds, with their routes (Home has none of its own; Rounds has its review, new,
 * continue and recover routes as well); the shared state files have their own check (states.test.tsx).
 */
const root = join(__dirname, '..');
const pages = ['calendar', 'hub', 'messages', 'settings', 'home', 'stats', 'roster', 'recruiting', 'coachhelm', 'classes', 'rounds'];

/** A page's routes besides its own `routes/<page>.tsx`. */
const moreRoutes: Record<string, string[]> = { rounds: ['round-review', 'round-new', 'round-continue', 'round-recover'] };

/** Straight quotes a file format needs, not words on the screen: a CSV cell (the Roster and Team stats exports, RFC 4180). */
const csvCell = '`"${String(v).replace(/"/g, \'""\')}"`';

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
    const routes = [page, ...(moreRoutes[page] ?? [])].map((route) => join(root, 'routes', `${route}.tsx`));
    const files = [...sources(join(root, 'screens', page)), ...routes].filter((file) => existsSync(file));
    for (const file of files) {
      const src = code(file);
      expect(src.match(/[A-Za-z]'[A-Za-z]/g), file).toBeNull();
      expect(src, file).not.toContain('&apos;');
      // A name quoted inside the words ("Posted “Waiver”"), not an attribute value in a selector (="${id}").
      expect(src.split(csvCell).join('').match(/(?<![=\w])"\$\{[^}]*\}"/g), file).toBeNull();
    }
  });
});

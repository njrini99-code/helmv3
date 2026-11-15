import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Fairway retirement (owner, 2026-11-14: "No allowlist, complete replacement of fairway"). Clubhouse (src/clubhouse) is
 * the only coach and player UI. Fairway's page trees are retired: nothing may import them again, by a static or
 * dynamic import, a re-export, `require`, `vi.mock` / `vi.importActual`, or a path string a test reads a source by.
 *
 * What stays under a retired folder is listed in KEPT, each with the reason. Fairway's shared primitives
 * (`src/components/fairway/{controls,charts,feedback,modules,...}`) are not retired: admin, baseball, auth and the CRM
 * use them.
 */

const ROOT = resolve(__dirname, '../..');

/** Retired trees, as repo paths (a trailing slash is a folder). */
export const RETIRED = [
  'src/components/fairway/pages/',
  'src/components/golf/',
  'src/app/golf/(dashboard)/FairwayDashboardShell',
  'src/app/fairway-preview/',
  'src/app/vizlab/',
];

/** Files under a retired folder that stay, and why. */
export const KEPT: Array<[prefix: string, reason: string]> = [
  ['src/components/golf/calendar/', "BaseballHelm's calendar draws it through src/components/shared/calendar"],
  ['src/components/golf/documents/ImagePreview', "BaseballHelm's document preview"],
  ['src/components/golf/documents/PDFViewer', "BaseballHelm's document preview"],
  ['src/components/golf/documents/TextPreview', "BaseballHelm's document preview"],
];

/**
 * Importers still being retired in this change. Each one is deleted or rewritten to Clubhouse in the deletion commit,
 * which empties this list; it must stay empty after that.
 */
const PENDING: string[] = [
  'src/app/golf/(auth)/demo/page.tsx',
  'src/app/golf/(auth)/signup/page.tsx',
  'src/app/golf/(onboarding)/coach/page.tsx',
  'src/app/golf/(onboarding)/player/__tests__/page.field-validation.test.tsx',
  'src/app/golf/(onboarding)/player/page.tsx',
  'src/components/auth/golf-auth-canvas.tsx',
  'src/components/auth/GolfAuthShell.tsx',
];

const isRetired = (repoPath: string) =>
  RETIRED.some((r) => repoPath === r || repoPath.startsWith(r) || repoPath.startsWith(`${r}.`)) &&
  !KEPT.some(([k]) => repoPath.startsWith(k));

const inRetiredTree = (repoPath: string) => RETIRED.some((r) => repoPath.startsWith(r) || repoPath.startsWith(`${r}.`));

function walk(dir: string, out: string[]) {
  if (!existsSync(dir)) return;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== 'node_modules') walk(p, out);
    } else if (/\.(tsx?|mjs|js)$/.test(e.name)) out.push(p);
  }
}

/** A specifier as a repo path (without extension), or null for a package. */
function specToRepoPath(from: string, spec: string): string | null {
  if (spec.startsWith('@/')) return `src/${spec.slice(2)}`;
  if (spec.startsWith('.')) return relative(ROOT, resolve(dirname(from), spec));
  if (/^(src|\.\/src)\//.test(spec)) return spec.replace(/^\.\//, '');
  return null;
}

// Import-like specifiers: from '…', import('…'), require('…'), vi.mock('…'), vi.importActual('…'), vi.doMock('…').
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bvi\.(?:mock|doMock|importActual|importMock)\s*\(\s*|^\s*import\s+)(['"`])([^'"`\n]+)\1/gm;
// A path string naming a source file (a test that reads a source by path). Quoted, not backticked: a backticked path is
// prose in a comment.
const PATH_STRING = /(['"])((?:\.\/)?src\/(?:components\/(?:fairway\/pages|golf)\/|app\/golf\/\(dashboard\)\/FairwayDashboardShell|app\/(?:fairway-preview|vizlab)\/)[^'"\n]*)\1/g;

/** The source without comments: a path in a comment is a note, not a reference. */
function code(text: string): string {
  // A block comment is matched without crossing its own `*/`, so the scan stays linear (client-boundary.test.ts).
  return text.replace(/\/\*[^*]*\*+(?:[^/*][^*]*\*+)*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

export function retiredImports(files: string[]): string[] {
  const found: string[] = [];
  for (const file of files) {
    const rel = relative(ROOT, file);
    // This guard names the retired paths on purpose.
    if (inRetiredTree(rel) || file === __filename) continue;
    const src = code(readFileSync(file, 'utf8'));
    for (const re of [SPECIFIER, PATH_STRING]) {
      for (const m of src.matchAll(re)) {
        const spec = m[2] ?? '';
        const target = specToRepoPath(file, spec);
        if (target && isRetired(target)) found.push(`${rel} -> ${spec}`);
      }
    }
  }
  return [...new Set(found)].sort();
}

describe('Fairway retirement: nothing imports the retired Fairway trees', () => {
  const files: string[] = [];
  walk(join(ROOT, 'src'), files);

  it('no file outside the retired trees imports, mocks or reads one', () => {
    const found = retiredImports(files).filter((line) => !PENDING.some((p) => line.startsWith(p)));
    expect(found).toEqual([]);
  });

  it('every KEPT entry still exists (drop it when its last file goes)', () => {
    for (const [prefix] of KEPT) {
      const exists = [prefix, `${prefix}.ts`, `${prefix}.tsx`].some((p) => existsSync(join(ROOT, p)) && (statSync(join(ROOT, p)).isFile() || readdirSync(join(ROOT, p)).length > 0));
      expect(exists, prefix).toBe(true);
    }
  });

  it('the scan sees each kind of reference', () => {
    const probe = join(ROOT, 'src/__tests__/__probe__.ts');
    const lines = [
      "import { A } from '@/components/fairway/pages/dashboard';",
      "const B = await import('@/components/golf/coachhelm/chat/AskSurface');",
      "vi.mock('@/components/golf/OfflineProvider', () => ({}));",
      "readFileSync('src/components/fairway/pages/rounds-recover/FairwayRecoverRound.tsx', 'utf8');",
      "import { C } from '@/components/golf/calendar/MonthView';",
      "import { D } from '@/components/fairway/controls';",
    ];
    const scan = (text: string) => {
      const out: string[] = [];
      for (const re of [SPECIFIER, PATH_STRING]) for (const m of text.matchAll(re)) {
        const t = specToRepoPath(probe, m[2] ?? '');
        if (t && isRetired(t)) out.push(m[2] ?? '');
      }
      return out;
    };
    expect(scan(lines.join('\n'))).toEqual([
      '@/components/fairway/pages/dashboard',
      '@/components/golf/coachhelm/chat/AskSurface',
      '@/components/golf/OfflineProvider',
      'src/components/fairway/pages/rounds-recover/FairwayRecoverRound.tsx',
    ]);
  });
});

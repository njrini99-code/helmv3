import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

/**
 * Regression guard for the fluid GenomeRadar refactor (W4A).
 *
 * Background: GenomeRadar used to take a numeric `size` prop and render a
 * fixed-pixel square SVG (e.g. `size={460}`), which overflowed narrow
 * phone viewports. The fix makes the radar fluid: a `0 0 100 100`
 * viewBox at `width="100%"` inside an `aspect-square max-w-md` wrapper,
 * with all internal geometry remapped via a single transform.
 *
 * This test fails on any regression that:
 *   - reintroduces a `size` prop on the GenomeRadar component, or
 *   - reintroduces a numeric `size={...}` prop on a <GenomeRadar /> call
 *     in any consumer page, or
 *   - drops the `viewBox="0 0 100 100"` / `width="100%"` fluid contract.
 *
 * Audit reference: ultra-audit master synthesis — W4 responsive surface.
 */

const REPO_ROOT = resolve(import.meta.dirname, '..', '..');

const RADAR_FILE = join(
  REPO_ROOT,
  'src',
  'components',
  'golf',
  'coachhelm',
  'v3',
  'Genome',
  'GenomeRadar.tsx',
);

// The pages that render <GenomeRadar /> and must NOT pass a size prop.
const CONSUMER_FILES = [
  join(
    REPO_ROOT,
    'src/app/golf/(dashboard)/dashboard/my-game-profile/page.tsx',
  ),
  join(
    REPO_ROOT,
    'src/app/golf/(dashboard)/dashboard/coachhelm/genome/compare/page.tsx',
  ),
  join(
    REPO_ROOT,
    'src/app/golf/(dashboard)/dashboard/coachhelm/genome/[playerId]/page.tsx',
  ),
];

async function read(file) {
  const info = await stat(file).catch(() => null);
  assert.ok(
    info && info.isFile(),
    `Expected source file to exist: ${relative(REPO_ROOT, file)}`,
  );
  return readFile(file, 'utf8');
}

test('GenomeRadar uses a 0 0 100 100 viewBox and renders at full width', async () => {
  const src = await read(RADAR_FILE);
  assert.match(
    src,
    /viewBox="0 0 100 100"/,
    'GenomeRadar must use a fixed viewBox="0 0 100 100" so it scales fluidly.',
  );
  assert.match(
    src,
    /width="100%"/,
    'GenomeRadar <svg> must use width="100%" so it fills its container.',
  );
  assert.match(
    src,
    /preserveAspectRatio=/,
    'GenomeRadar <svg> must set preserveAspectRatio to stay square.',
  );
  assert.match(
    src,
    /aspect-square/,
    'GenomeRadar wrapper must be aspect-square so the SVG keeps its ratio.',
  );
  assert.match(
    src,
    /max-w-md/,
    'GenomeRadar wrapper must cap its width with max-w-md.',
  );
});

test('GenomeRadar exposes no numeric size prop', async () => {
  const src = await read(RADAR_FILE);

  // No `size?: number` (or `size: number`) prop in the component interface.
  assert.doesNotMatch(
    src,
    /\bsize\s*\??\s*:\s*number\b/,
    'GenomeRadar must not declare a numeric `size` prop — the radar is fluid.',
  );

  // No fixed-pixel square wrapper driven by a size variable.
  assert.doesNotMatch(
    src,
    /width:\s*size\b/,
    'GenomeRadar must not size its wrapper from a `size` variable.',
  );

  // No `width={size}` / `height={size}` on the <svg>.
  assert.doesNotMatch(
    src,
    /(?:width|height)=\{size\}/,
    'GenomeRadar <svg> must not bind width/height to a `size` prop.',
  );
});

test('GenomeRadar consumers pass no numeric size prop', async () => {
  // Match a <GenomeRadar ...> opening tag (possibly multi-line) and assert
  // it carries no `size=` prop. `[\s\S]*?` is non-greedy so we stop at the
  // first `>` that closes the opening tag.
  const openingTag = /<GenomeRadar\b[\s\S]*?>/g;
  const violations = [];

  for (const file of CONSUMER_FILES) {
    const src = await read(file);
    let match;
    while ((match = openingTag.exec(src)) !== null) {
      if (/\bsize\s*=/.test(match[0])) {
        violations.push(
          `${relative(REPO_ROOT, file)} → ${match[0].replace(/\s+/g, ' ').trim()}`,
        );
      }
    }
  }

  if (violations.length > 0) {
    assert.fail(
      `Found ${violations.length} <GenomeRadar /> call(s) still passing a size prop.\n` +
        `Drop size={...}; the radar is fluid (viewBox + max-w-md).\n\n` +
        violations.map((v) => `  - ${v}`).join('\n'),
    );
  }

  // Sanity: every consumer should actually render the radar, so the guard
  // above is meaningful and not passing trivially on a renamed import.
  for (const file of CONSUMER_FILES) {
    const src = await read(file);
    assert.match(
      src,
      /<GenomeRadar\b/,
      `Expected ${relative(REPO_ROOT, file)} to render <GenomeRadar />.`,
    );
  }
});

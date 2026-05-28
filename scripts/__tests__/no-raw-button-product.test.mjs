import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';

/**
 * Regression guard for the Wave W2A-button migration (agent W2A).
 *
 * The canonical interactive primitives are <Button> and <IconButton> from
 * `@/components/ui/button`. W2A migrated EVERY raw <button> JSX element in
 * product code (src/app + src/components) to those primitives:
 *   - text / icon+text buttons  -> <Button variant="primary|ghost|danger">
 *   - icon-only buttons         -> <IconButton aria-label=...>
 *   - self-closing overlays      -> <IconButton ...><span class="sr-only">…</span></IconButton>
 * preserving every onClick / disabled / type / form / aria-* / className.
 *
 * Raw <button> INSIDE the design-system primitives (src/components/ui/**) is
 * the canonical implementation and is ALLOWED. Static design mockups
 * (src/components/mockups/**) are likewise out of scope. Everything else —
 * all PRODUCT code — must contain ZERO raw <button> JSX elements.
 *
 * This test scans the product tree and FAILS if any raw `<button` JSX opening
 * tag reappears, so the migration cannot silently regress.
 *
 * Audit reference: ultra-audit master synthesis — component consistency /
 * implementation-debt (A4 / A11): one canonical button primitive, no raw
 * <button> in product code.
 */

const REPO_ROOT = resolve(import.meta.dirname, '..', '..');

// Both product trees are in scope.
const SCAN_DIRS = [
  join(REPO_ROOT, 'src', 'app'),
  join(REPO_ROOT, 'src', 'components'),
];

// Reserved subtrees (absolute paths) that own raw <button> on purpose:
//   - src/components/ui       — the canonical <Button>/<IconButton> primitives
//                               + Radix-based primitives (dialog, select, etc.)
//   - src/components/mockups  — static design mockups, not shipped product UI
const EXCLUDED_DIRS = [
  join(REPO_ROOT, 'src', 'components', 'ui'),
  join(REPO_ROOT, 'src', 'components', 'mockups'),
];

const FILE_EXTENSIONS = new Set(['.ts', '.tsx']);
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'dist', 'build']);

// A raw <button> JSX opening tag: `<button` followed by whitespace, `>` or `/`
// (covers `<button>`, `<button …>`, and self-closing `<button … />`). We match
// the opening tag only — `</button>` closers are a consequence, not a source.
const BANNED_BUTTON = /<button(?=[\s/>])/g;

/**
 * Allowlist for genuinely-unavoidable raw <button> in product code. There are
 * NONE after the W2A migration — every product button is a <Button>/<IconButton>.
 *
 * If a future case genuinely cannot use the primitive (it cannot — the
 * primitive forwards every prop and ref), add a
 *   `{ file: '<repo-relative-path>', match: '<button' }`
 * entry here WITH a comment explaining why. The test still FAILS on any
 * non-allowlisted reintroduction.
 */
const ALLOWLIST = [
  // (intentionally empty — product tree uses <Button>/<IconButton> exclusively)
];

function isAllowlisted(relPath, match) {
  return ALLOWLIST.some((e) => e.file === relPath && e.match === match);
}

function isExcluded(fullPath) {
  return EXCLUDED_DIRS.some(
    (dir) => fullPath === dir || fullPath.startsWith(dir + sep),
  );
}

async function walk(dir, files = []) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return files;
    throw err;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (isExcluded(full)) continue;
    if (entry.isDirectory()) {
      await walk(full, files);
    } else if (entry.isFile()) {
      const dot = entry.name.lastIndexOf('.');
      const ext = dot >= 0 ? entry.name.slice(dot) : '';
      if (FILE_EXTENSIONS.has(ext)) files.push(full);
    }
  }
  return files;
}

/**
 * Strip line + block comments so a comment that merely mentions the literal
 * `<button` text is not a false positive. (String-literal mentions are
 * vanishingly rare and would themselves be a code smell, so we keep the scan
 * simple and only strip comments.)
 */
function stripComments(src) {
  // Block comments
  let out = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  // Line comments (best-effort; not URL-aware but `<button` won't appear in a URL)
  out = out.replace(/\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, ' '));
  return out;
}

function findBannedHits(content) {
  const cleaned = stripComments(content);
  const hits = [];
  const lines = cleaned.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    BANNED_BUTTON.lastIndex = 0;
    let match;
    while ((match = BANNED_BUTTON.exec(line)) !== null) {
      hits.push({
        line: i + 1,
        column: match.index + 1,
        match: match[0],
        snippet: line.trim(),
      });
      if (match.index === BANNED_BUTTON.lastIndex) BANNED_BUTTON.lastIndex++;
    }
  }
  return hits;
}

test('no raw <button> JSX in product code (src/app + src/components, excl. ui + mockups)', async () => {
  for (const dir of SCAN_DIRS) {
    const info = await stat(dir).catch(() => null);
    assert.ok(info && info.isDirectory(), `Expected scan directory to exist: ${dir}`);
  }

  const files = [];
  for (const dir of SCAN_DIRS) {
    await walk(dir, files);
  }
  assert.ok(files.length > 0, 'Expected to scan at least one source file');

  const violations = [];
  for (const file of files) {
    const content = await readFile(file, 'utf8');
    const hits = findBannedHits(content);
    const relPath = relative(REPO_ROOT, file);
    for (const hit of hits) {
      if (isAllowlisted(relPath, hit.match)) continue;
      violations.push(
        `${relPath}:${hit.line}:${hit.column} → ${hit.match}` +
          `\n    ${hit.snippet}` +
          `\n    fix: use <Button variant="primary|ghost|danger"> or <IconButton aria-label=…> from '@/components/ui/button'.`,
      );
    }
  }

  if (violations.length > 0) {
    const message =
      `Found ${violations.length} raw <button> JSX element(s) in product code.\n` +
      `These were migrated to <Button>/<IconButton> in Wave W2A — do not reintroduce them.\n` +
      `(Raw <button> is allowed only inside src/components/ui/** and src/components/mockups/**.)\n\n` +
      violations.map((v) => `  - ${v}`).join('\n');
    assert.fail(message);
  }
});

test('reserved subtrees (ui + mockups) are excluded from the scan', () => {
  for (const dir of EXCLUDED_DIRS) {
    assert.ok(isExcluded(dir), `Reserved dir should be excluded: ${dir}`);
    assert.ok(
      isExcluded(join(dir, 'SomeFile.tsx')),
      `Files under reserved dir should be excluded: ${dir}`,
    );
  }
  // A normal product path must NOT be excluded.
  assert.ok(
    !isExcluded(join(REPO_ROOT, 'src', 'components', 'golf', 'roster', 'RosterToolbar.tsx')),
    'Owned product files must not be excluded',
  );
  assert.ok(
    !isExcluded(join(REPO_ROOT, 'src', 'app', 'golf', 'admin', 'page.tsx')),
    'Owned app files must not be excluded',
  );
});

test('the banned pattern matches real raw <button> tags but not the primitives', () => {
  // Sanity: the regex catches the forms W2A migrated …
  for (const sample of ['<button>', '<button className="x">', '<button\n  type="submit"', '<button />']) {
    BANNED_BUTTON.lastIndex = 0;
    assert.ok(BANNED_BUTTON.test(sample), `Should flag raw button: ${JSON.stringify(sample)}`);
  }
  // … and does NOT flag the canonical primitives or unrelated identifiers.
  for (const sample of ['<Button>', '<IconButton aria-label="x">', '<ButtonGroup>', 'buttonRef', 'myButton(']) {
    BANNED_BUTTON.lastIndex = 0;
    assert.ok(!BANNED_BUTTON.test(sample), `Should NOT flag: ${JSON.stringify(sample)}`);
  }
});

test('comment mentions of <button> are not false positives', () => {
  const src = '// Compact renders a <button>, so we drop the ref\nconst x = 1;';
  assert.equal(findBannedHits(src).length, 0, 'A comment mentioning <button> must not be a violation');
});

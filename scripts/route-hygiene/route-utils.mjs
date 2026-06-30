import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeAppFile } from './route-normalizer.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const generatedDir = join(repoRoot, 'docs/operations/generated');
const revealedBugsDir = join(repoRoot, 'docs/operations/revealed-bugs/routes');

export const REPO_ROOT = repoRoot;

function walkFiles(rootDir, matcher) {
  const results = [];
  if (!existsSync(rootDir)) return results;
  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of readdirSync(current)) {
      const full = join(current, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        stack.push(full);
        continue;
      }
      const rel = relative(repoRoot, full).split('\\').join('/');
      if (matcher(rel)) results.push(rel);
    }
  }
  return results.sort();
}

export function ensureGeneratedDir() {
  mkdirSync(generatedDir, { recursive: true });
}

export function ensureRevealedBugsDir() {
  mkdirSync(revealedBugsDir, { recursive: true });
}

export function writeJson(name, data) {
  ensureGeneratedDir();
  writeFileSync(join(generatedDir, name), `${JSON.stringify(data, null, 2)}\n`);
}

export function writeMarkdown(name, markdown) {
  ensureGeneratedDir();
  writeFileSync(join(generatedDir, name), markdown.endsWith('\n') ? markdown : `${markdown}\n`);
}

export function readJson(name, fallback) {
  const path = join(generatedDir, name);
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function appFiles() {
  return walkFiles(join(repoRoot, 'src/app'), (rel) =>
    /\/(page|route)\.(ts|tsx|js|jsx)$/.test(rel),
  );
}

export function layoutFiles() {
  return walkFiles(join(repoRoot, 'src/app'), (rel) =>
    /\/(layout|loading|error|not-found)\.(ts|tsx)$/.test(rel),
  );
}

export function sourceFiles() {
  return walkFiles(join(repoRoot, 'src'), (rel) =>
    /\.(ts|tsx)$/.test(rel) &&
    !rel.includes('/contracts/') &&
    !/\.test\.(ts|tsx)$/.test(rel),
  );
}

export function e2eFiles() {
  return walkFiles(join(repoRoot, 'e2e'), (rel) => /\.(ts|tsx)$/.test(rel));
}

/** @deprecated use normalizeAppFile */
export function routeFromFile(file) {
  const row = normalizeAppFile(file);
  return row?.canonicalPath ?? null;
}

const HREF_PATTERNS = [
  /(?:href|to)\s*=\s*["'`]([^"'`]+)["'`]/g,
  /(?:router\.push|router\.replace|redirect|permanentRedirect|revalidatePath|navigate)\s*\(\s*["'`]([^"'`]+)["'`]/g,
  /window\.location\.href\s*=\s*["'`]([^"'`]+)["'`]/g,
  /href:\s*["'`]([^"'`]+)["'`]/g,
];

export function extractHrefLikeStrings(source) {
  const out = new Set();
  for (const re of HREF_PATTERNS) {
    re.lastIndex = 0;
    for (const match of source.matchAll(re)) {
      const href = match[1]?.trim();
      if (href?.startsWith('/')) out.add(href);
    }
  }
  return [...out];
}

export function canonicalRouteHref(href) {
  try {
    const url = new URL(href, 'http://helm.local');
    return url.pathname.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
  } catch {
    return href.split('?')[0]?.split('#')[0]?.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
  }
}

export function publicAssetExists(href) {
  const pathname = canonicalRouteHref(href);
  if (!pathname || pathname === '/') return false;
  return existsSync(join(repoRoot, 'public', pathname.replace(/^\//, '')));
}

export function readSource(file) {
  return readFileSync(join(repoRoot, file), 'utf8');
}

export function repoPath(file) {
  return relative(process.cwd(), join(repoRoot, file));
}

export function dirHasFile(dir, name) {
  const base = dir.replace(/\/[^/]+$/, '');
  return existsSync(join(repoRoot, base, name));
}

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { globSync } from 'glob';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const generatedDir = join(repoRoot, 'docs/operations/generated');

export function ensureGeneratedDir() {
  mkdirSync(generatedDir, { recursive: true });
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
  return globSync('src/app/**/{page,route,layout,loading,error,template,not-found}.{ts,tsx}', {
    cwd: repoRoot,
    nodir: true,
    posix: true,
  }).sort();
}

export function sourceFiles() {
  return globSync('src/**/*.{ts,tsx}', {
    cwd: repoRoot,
    nodir: true,
    posix: true,
    ignore: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'src/contracts/**'],
  }).sort();
}

export function routeFromFile(file) {
  const parts = file.split(sep).join('/').replace(/^src\/app\//, '').split('/');
  const leaf = parts.pop();
  if (!leaf) return null;
  if (!/^(page|route)\.(ts|tsx)$/.test(leaf)) return null;
  const clean = parts.filter((part) => !part.startsWith('(') && !part.startsWith('@'));
  return `/${clean.join('/')}`.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
}

export function extractHrefLikeStrings(source) {
  const out = [];
  const re = /(?:href|to|redirect|router\.push|router\.replace)\s*(?:=|\()\s*["'`]([^"'`]+)["'`]/g;
  for (const match of source.matchAll(re)) {
    if (match[1]?.startsWith('/')) out.push(match[1]);
  }
  return out;
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

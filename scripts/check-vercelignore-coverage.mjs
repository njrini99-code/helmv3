#!/usr/bin/env node
/**
 * check-vercelignore-coverage.mjs — is every secret-bearing or local-only path
 * actually kept out of the Vercel upload?
 *
 * WHY THIS EXISTS
 *
 * `.vercelignore` REPLACES Vercel's default ignore set; it does not extend it.
 * The moment the file exists, `.gitignore` stops meaning anything to the
 * upload, so every gitignored secret is shipped off this machine unless this
 * file names it too. That is how the `.env` family reached every production
 * upload until #1714, and it was found by simulating the upload set by hand.
 * A hand simulation is not a gate. Measured 2026-09-01, still uncovered and
 * present on disk: `.cursor/mcp.json` (an `sbp_` Supabase token — see
 * `.gitleaks.toml`), `context7.json` (an API key), `playwright/.auth/`
 * (session cookies), `momentic/auth/` (test-account auth), and a dozen local
 * artifact directories.
 *
 * WHAT IT CHECKS
 *
 * `config/repo/manifest.yml` → `vercel.must_ignore` is the maintained list of
 * paths that must never be uploaded. Each is matched against `.vercelignore`
 * with gitignore-style semantics (the same family Vercel uses): a pattern with
 * no slash matches any path segment at any depth, a pattern with a slash is
 * anchored at the root, a trailing slash means "directory", `*`/`**`/`?`
 * glob, and a later `!pattern` re-includes. A path is covered when it or one
 * of its ancestor directories matches a non-negated pattern and nothing later
 * re-includes it.
 *
 * It does NOT prove the upload set — only Vercel can do that — but it proves
 * the file says what the manifest requires, which is the half that rots.
 *
 * Usage:
 *   node scripts/check-vercelignore-coverage.mjs            exit 1 on any uncovered path
 *   node scripts/check-vercelignore-coverage.mjs --json
 *
 * Exit: 0 all covered · 1 uncovered paths · 2 could not check (missing file)
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Parse `.vercelignore` text into ordered rules. */
export function parseIgnore(text) {
  const rules = [];
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, '');
    if (!line || line.startsWith('#')) continue;
    let pat = line;
    const negate = pat.startsWith('!');
    if (negate) pat = pat.slice(1);
    const dirOnly = pat.endsWith('/');
    if (dirOnly) pat = pat.slice(0, -1);
    const anchored = pat.includes('/');
    if (pat.startsWith('/')) pat = pat.slice(1);
    if (!pat) continue;
    rules.push({ raw: line, negate, dirOnly, anchored, regex: globToRegex(pat) });
  }
  return rules;
}

/**
 * A gitignore glob to an anchored regex over ONE path (or one segment when the
 * pattern is unanchored). `**` crosses directories; `*` and `?` do not.
 */
export function globToRegex(glob) {
  let out = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        out += '.*';
        i++;
        if (glob[i + 1] === '/') i++;
      } else {
        out += '[^/]*';
      }
    } else if (c === '?') {
      out += '[^/]';
    } else {
      out += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${out}$`);
}

/**
 * Does `rule` match `path` (a repo-relative path, no leading slash)?
 * `isDir` says whether the path being tested denotes a directory.
 */
function ruleMatches(rule, path, isDir) {
  if (rule.dirOnly && !isDir) return false;
  if (rule.anchored) return rule.regex.test(path);
  // Unanchored: any segment. A directory pattern must match a directory
  // segment, which every segment except the last is; the last is `isDir`.
  const segs = path.split('/');
  return segs.some((s, i) => rule.regex.test(s) && (!rule.dirOnly || i < segs.length - 1 || isDir));
}

/**
 * Is `required` (trailing slash = directory) excluded by the parsed rules?
 * Walks the path and each ancestor directory; the LAST matching rule wins,
 * exactly as gitignore evaluates negations.
 */
export function isCovered(required, rules) {
  const isDir = required.endsWith('/');
  const path = required.replace(/^\/+/, '').replace(/\/+$/, '');
  if (!path) return false;
  const segs = path.split('/');
  // Candidates: every ancestor dir, then the path itself.
  const candidates = segs.map((_, i) => ({ p: segs.slice(0, i + 1).join('/'), dir: i < segs.length - 1 || isDir }));
  let covered = false;
  for (const cand of candidates) {
    let verdict = null;
    for (const rule of rules) {
      if (ruleMatches(rule, cand.p, cand.dir)) verdict = !rule.negate;
    }
    if (verdict === true) covered = true; // an excluded ancestor excludes everything below it
    if (verdict === false && cand.p === path) covered = false; // the path itself re-included
  }
  return covered;
}

/** @returns {{ covered: string[], uncovered: string[] }} */
export function coverage(required, ignoreText) {
  const rules = parseIgnore(ignoreText);
  const covered = [];
  const uncovered = [];
  for (const r of required) (isCovered(r, rules) ? covered : uncovered).push(r);
  return { covered, uncovered };
}

/** Read `vercel.must_ignore` from the manifest without a YAML dependency for the CLI path. */
export function requiredFromManifest(manifestText) {
  const lines = String(manifestText).split(/\r?\n/);
  const out = [];
  let inVercel = false;
  let inList = false;
  for (const line of lines) {
    if (/^vercel:\s*$/.test(line)) { inVercel = true; inList = false; continue; }
    if (inVercel && /^\S/.test(line)) { inVercel = false; inList = false; }
    if (!inVercel) continue;
    if (/^\s+must_ignore:\s*$/.test(line)) { inList = true; continue; }
    if (inList) {
      const m = line.match(/^\s+-\s+(?:'([^']*)'|"([^"]*)"|(\S+))\s*(?:#.*)?$/);
      if (m) out.push(m[1] ?? m[2] ?? m[3]);
      else if (/^\s+\S/.test(line) && !/^\s+#/.test(line)) inList = false;
    }
  }
  return out;
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function main() {
  const json = process.argv.includes('--json');
  const ignorePath = resolve(ROOT, '.vercelignore');
  const manifestPath = resolve(ROOT, 'config/repo/manifest.yml');
  if (!existsSync(ignorePath)) {
    console.error('check-vercelignore-coverage: .vercelignore is missing — Vercel would fall back to its default ignore set, which this repo does not rely on.');
    process.exit(2);
  }
  if (!existsSync(manifestPath)) {
    console.error('check-vercelignore-coverage: config/repo/manifest.yml is missing.');
    process.exit(2);
  }
  const required = requiredFromManifest(readFileSync(manifestPath, 'utf-8'));
  if (!required.length) {
    console.error('check-vercelignore-coverage: manifest has no vercel.must_ignore entries — nothing to check is not a pass.');
    process.exit(2);
  }
  const result = coverage(required, readFileSync(ignorePath, 'utf-8'));
  if (json) {
    console.log(JSON.stringify({ required: required.length, ...result }, null, 2));
  } else {
    console.log(`.vercelignore covers ${result.covered.length}/${required.length} required paths`);
    for (const u of result.uncovered) console.log(`  UNCOVERED  ${u}`);
  }
  process.exit(result.uncovered.length ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) main();

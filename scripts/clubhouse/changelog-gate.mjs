/**
 * clubhouse:check, changelog gate: a page whose implementation files changed on
 * this branch must also change its own docs/clubhouse/pages/<P###-slug>/CHANGELOG.md.
 *
 * "This branch" is the working tree against the merge-base with origin/main
 * (--base <ref> or CLUBHOUSE_BASE overrides the ref), so uncommitted work counts. A page's
 * implementation files are the manifest's implementation.root (a directory or a
 * file), loader, route and styles, and an action's component file that only this page names.
 * Tests (`__tests__`, `*.test.*`, `*.spec.*`) never trigger it. When no base can be
 * resolved (a shallow clone, no remote) the gate is skipped and says so. No CI job
 * runs clubhouse:check today, so it is enforced locally, before work is reported
 * done; ci.yml checks out with fetch-depth 0, so a CI job could resolve the base.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// A test is a file under a __tests__ directory or a *.test.* / *.spec.* file. Two plain checks rather than one alternation, whose
// anchors would bind to one branch only (CodeQL js/regex/missing-regexp-anchor).
const TEST_SUFFIX = /\.(?:test|spec)\.[cm]?[jt]sx?$/;
export const isTestFile = (f) => f.split('/').includes('__tests__') || TEST_SUFFIX.test(f);

const covers = (path, file) => file === path || file.startsWith(path.endsWith('/') ? path : `${path}/`);
const componentFiles = (m) => [...new Set((m.actions ?? []).map((a) => a.component?.split('#')[0]).filter(Boolean))];

/**
 * The paths a page owns (tests excluded): implementation.root, loader, route and
 * styles, plus an action's component file that lies outside them when no other
 * page's actions name it. A shared piece (src/clubhouse/ui/Notices.tsx serves
 * five pages) belongs to none. A root, loader, route or styles path that two
 * manifests share (stats: P004 and P005) counts for both.
 */
export function implementationPaths(m, manifests = [m]) {
  const impl = m.implementation ?? {};
  const own = [impl.root, impl.loader, impl.route, impl.styles].filter(Boolean);
  const sole = componentFiles(m).filter((c) => !own.some((p) => covers(p, c)) && manifests.filter((o) => componentFiles(o).includes(c)).length === 1);
  return [...new Set([...own, ...sole])];
}

/** Map of page id to { m, files } for every page with a changed, non-test implementation file. */
export function pagesTouched(manifests, changed) {
  const touched = new Map();
  const owned = new Map(manifests.map((m) => [m.id, implementationPaths(m, manifests)]));
  for (const file of changed.filter((f) => !isTestFile(f))) {
    for (const m of manifests) {
      if (!owned.get(m.id).some((p) => covers(p, file))) continue;
      if (!touched.has(m.id)) touched.set(m.id, { m, files: [] });
      touched.get(m.id).files.push(file);
    }
  }
  return touched;
}

export const changelogPath = (m) => `docs/clubhouse/pages/${m.id}-${m.slug}/CHANGELOG.md`;

export function checkChangelogs(manifests, changed, baseLabel) {
  const changedSet = new Set(changed);
  const v = [];
  for (const { m, files } of pagesTouched(manifests, changed).values()) {
    if (changedSet.has(changelogPath(m))) continue;
    const shown = files.slice(0, 5).join(', ') + (files.length > 5 ? `, +${files.length - 5} more` : '');
    v.push(`${m.id} ${m.name}: implementation changed since ${baseLabel} (${shown}) but ${changelogPath(m)} did not; add a dated entry`);
  }
  return v;
}

export function loadManifests(root) {
  const dir = join(root, 'config/clubhouse/pages');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => /^P\d{3}-.+\.json$/.test(n))
    .map((n) => JSON.parse(readFileSync(join(dir, n), 'utf8')));
}

const git = (root, args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

/** `{ ref, sha }` for the merge-base of HEAD and the first candidate ref that resolves, or null. */
export function resolveBase(root, explicit) {
  for (const ref of [explicit, process.env.CLUBHOUSE_BASE, 'origin/main', 'main'].filter(Boolean)) {
    try {
      return { ref, sha: git(root, ['merge-base', 'HEAD', ref]) };
    } catch {
      // not a ref here, or a shallow clone without the common ancestor
    }
  }
  return null;
}

/** Repo-relative paths changed since `sha`: tracked (renames as delete plus add) and untracked, uncommitted work included. */
export function changedFiles(root, sha) {
  const lines = (out) => out.split('\n').filter(Boolean);
  return [...new Set([...lines(git(root, ['diff', '--name-only', '--no-renames', sha])), ...lines(git(root, ['ls-files', '--others', '--exclude-standard']))])];
}

/** `{ violations, note }`; a note instead of violations when the gate had to be skipped. */
export function runChangelogGate(root, explicitBase) {
  const base = resolveBase(root, explicitBase);
  if (!base) return { violations: [], note: 'changelog gate skipped: no merge-base with origin/main (shallow clone or no remote); pass --base <ref> to enforce' };
  const manifests = loadManifests(root);
  const changed = changedFiles(root, base.sha);
  const violations = checkChangelogs(manifests, changed, `the merge-base with ${base.ref} (${base.sha.slice(0, 7)})`);
  return { violations, note: `changelog gate: ${pagesTouched(manifests, changed).size} page(s) with implementation changes since the merge-base with ${base.ref} (${base.sha.slice(0, 7)})` };
}

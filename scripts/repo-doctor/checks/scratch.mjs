// Giant gitignored scratch directories + duplicate source trees — the 26,519
// phantom files (.deepsec etc.) that buried real files in every search on
// 2026-08-20. Gitignored is NOT invisible to find/grep/rg.

import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { git } from '../lib/exec.mjs';
import { check, Status } from '../result.mjs';

export const meta = { id: 'scratch', title: 'Ignored scratch & duplicate trees' };

function countFiles(dir, cap) {
  let files = 0;
  let bytes = 0;
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    let entries;
    try { entries = readdirSync(d, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const full = join(d, e.name);
      if (e.isDirectory()) { stack.push(full); continue; }
      files += 1;
      try { bytes += statSync(full).size; } catch { /* ignore */ }
      if (files > cap) return { files, bytes, capped: true };
    }
  }
  return { files, bytes, capped: false };
}

export async function run(ctx) {
  const out = [];
  const { repoRoot, manifest } = ctx;
  const allow = new Set(manifest?.scratch?.allowlist ?? []);
  const warnFiles = manifest?.scratch?.warn_file_count ?? 5000;
  const warnBytes = manifest?.scratch?.warn_bytes ?? 250 * 1024 * 1024;

  // Only inspect gitignored top-level dirs (tracked dirs are the app; ignored
  // large dirs are the contaminants).
  let topDirs;
  try {
    topDirs = readdirSync(repoRoot, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch (err) {
    return [check('scratch.scan', Status.BLOCKED, 'could not read repo root', { detail: String(err) })];
  }

  const offenders = [];
  for (const name of topDirs) {
    if (allow.has(name)) continue;
    const ignored = git(repoRoot, ['check-ignore', name]);
    if (!ignored.ok) continue; // not ignored => tracked, not a scratch contaminant
    const { files, bytes, capped } = countFiles(join(repoRoot, name), warnFiles + 1);
    if (files > warnFiles || bytes > warnBytes) {
      offenders.push({ name, files: capped ? `>${warnFiles}` : files, mb: Math.round(bytes / 1048576) });
    }
  }
  out.push(
    offenders.length === 0
      ? check('scratch.giant-ignored', Status.PASS, 'no oversized gitignored scratch dirs in the repo root')
      : check('scratch.giant-ignored', Status.FAIL,
          `${offenders.length} gitignored scratch dir(s) exceed thresholds and poison file search`, {
            evidence: offenders,
            source: 'config/repo/manifest.yml (scratch.*)',
          }),
  );

  // Duplicate source trees: a second `src/app` anywhere other than <root>/src/app.
  //
  // Deliberately a filesystem walk, NOT `git ls-files`: ls-files only sees
  // TRACKED files, and the duplicate trees that actually caused harm (a nested
  // worktree, a copied checkout, .deepsec/) are untracked or ignored — exactly
  // the ones git cannot see. An earlier draft called ls-files here and never
  // used the result; CodeQL flagged the dead variable, correctly.
  const secondSrc = [];
  const stack = [{ dir: repoRoot, depth: 0 }];
  const skip = new Set(['node_modules', '.git', '.next', 'dist', '.turbo', 'coverage']);
  while (stack.length) {
    const { dir, depth } = stack.pop();
    if (depth > 3) continue;
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (!e.isDirectory() || skip.has(e.name)) continue;
      const full = join(dir, e.name);
      if (e.name === 'src' && full !== join(repoRoot, 'src')) {
        try {
          readdirSync(join(full, 'app'));
          secondSrc.push(full.replace(repoRoot + '/', ''));
        } catch { /* not an app src */ }
      } else if (e.name !== 'src') {
        stack.push({ dir: full, depth: depth + 1 });
      }
    }
  }
  out.push(
    secondSrc.length === 0
      ? check('scratch.duplicate-src', Status.PASS, 'no duplicate src/app trees under the repo root')
      : check('scratch.duplicate-src', Status.FAIL, `${secondSrc.length} duplicate src/app tree(s) found`, {
          evidence: secondSrc,
        }),
  );

  return out;
}

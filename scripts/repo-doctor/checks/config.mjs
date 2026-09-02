// Cross-cutting config: required npm scripts exist, exactly one Supabase root,
// and the Vercel deployment model is stated (so "merge ≠ ship" is never a
// surprise).

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { check, Status } from '../result.mjs';
import { coverage } from '../../check-vercelignore-coverage.mjs';

export const meta = { id: 'config', title: 'Scripts, Supabase root, deploy model, Vercel upload' };

export async function run(ctx) {
  const out = [];
  const { repoRoot, manifest } = ctx;

  // 1. Required npm scripts.
  const pkgPath = join(repoRoot, 'package.json');
  let pkg = {};
  try { pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')); }
  catch (err) { return [check('config.package', Status.BLOCKED, 'package.json unreadable', { detail: String(err) })]; }
  const scripts = pkg.scripts ?? {};
  const required = manifest?.required_scripts ?? [];
  const missing = required.filter((s) => !(s in scripts));
  out.push(
    missing.length === 0
      ? check('config.required-scripts', Status.PASS, `all ${required.length} required npm scripts present`)
      : check('config.required-scripts', Status.FAIL, `${missing.length} required npm script(s) missing`, {
          evidence: missing,
          source: 'config/repo/manifest.yml (required_scripts)',
        }),
  );

  // 2. Exactly one Supabase root (holds config.toml).
  const expectedRoot = manifest?.supabase?.root ?? 'supabase';
  const rootToml = join(repoRoot, expectedRoot, 'config.toml');
  out.push(
    existsSync(rootToml)
      ? check('config.supabase-root', Status.PASS, `Supabase root ${expectedRoot}/ present`)
      : check('config.supabase-root', Status.FAIL, `expected Supabase root ${expectedRoot}/config.toml not found`, {
          expected: `${expectedRoot}/config.toml`,
        }),
  );

  // 3. Vercel deployment model — surface it explicitly.
  const vjPath = join(repoRoot, 'vercel.json');
  if (existsSync(vjPath)) {
    try {
      const vj = JSON.parse(readFileSync(vjPath, 'utf-8'));
      const de = vj?.git?.deploymentEnabled;
      const disabled = de && Object.values(de).every((v) => v === false);
      out.push(
        check('config.deploy-model', Status.PASS,
          disabled
            ? 'production deploy model: MANUAL (git auto-deploy disabled) — merge ≠ ship'
            : 'production deploy model: git auto-deploy ENABLED', { actual: de ?? '(default)' }),
      );
    } catch (err) {
      out.push(check('config.vercel-json', Status.FAIL, 'vercel.json is not valid JSON', { detail: String(err) }));
    }
  }

  // 4. Vercel upload coverage. `.vercelignore` REPLACES the default ignore
  // set, so every secret-bearing gitignored path must be named there too —
  // the .env family shipped in every upload until #1714 because nothing
  // asserted this. The list of paths lives in the manifest (vercel.must_ignore);
  // the matcher lives in scripts/check-vercelignore-coverage.mjs, which is also
  // the CI step (`npm run check:vercelignore`). One list, one matcher.
  const mustIgnore = manifest?.vercel?.must_ignore ?? [];
  if (mustIgnore.length) {
    const viPath = join(repoRoot, '.vercelignore');
    if (!existsSync(viPath)) {
      out.push(check('config.vercelignore-coverage', Status.FAIL, '.vercelignore is missing — the manifest names paths that must be kept out of the Vercel upload', {
        expected: `${mustIgnore.length} path(s) excluded`,
        source: 'config/repo/manifest.yml (vercel.must_ignore)',
      }));
    } else {
      const r = coverage(mustIgnore, readFileSync(viPath, 'utf-8'));
      out.push(
        r.uncovered.length === 0
          ? check('config.vercelignore-coverage', Status.PASS, `.vercelignore covers all ${mustIgnore.length} paths that must never upload`)
          : check('config.vercelignore-coverage', Status.FAIL, `${r.uncovered.length} path(s) the manifest forbids from the Vercel upload are NOT excluded by .vercelignore`, {
              evidence: r.uncovered,
              source: 'config/repo/manifest.yml (vercel.must_ignore)',
            }),
      );
    }
  }

  return out;
}
